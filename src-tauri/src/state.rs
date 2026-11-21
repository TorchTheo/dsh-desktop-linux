use std::{
    collections::{HashMap, HashSet},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex as BlockingMutex, RwLock,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;

use crate::{
    config::AppConfig,
    domain::{
        AppStateSnapshot, BridgeCapabilities, SessionRunStatus, SessionSummary, WorkerStatus,
        WorkspaceSummary,
    },
    protocol::{sdk_adapter::SdkAdapter, BackendEvent},
    storage,
};

pub(crate) struct AppState {
    pub config: RwLock<AppConfig>,
    pub worker_status: RwLock<WorkerStatus>,
    pub bridge_capabilities: RwLock<BridgeCapabilities>,
    pub sessions: RwLock<Vec<SessionSummary>>,
    pub workspaces: RwLock<Vec<WorkspaceSummary>>,
    pub active_worker_sessions: RwLock<HashSet<String>>,
    pub adapter: Mutex<Option<Arc<SdkAdapter>>>,
    pub event_tx: mpsc::UnboundedSender<BackendEvent>,
    storage_refresh: BlockingMutex<()>,
    stopping: AtomicBool,
}

impl AppState {
    pub fn new(config: AppConfig, event_tx: mpsc::UnboundedSender<BackendEvent>) -> Self {
        Self::new_with_storage(config, event_tx, &storage::dsh_home_dir())
    }

    fn new_with_storage(
        config: AppConfig,
        event_tx: mpsc::UnboundedSender<BackendEvent>,
        dsh_home: &Path,
    ) -> Self {
        let (workspaces, sessions) = storage::workspace::load_workspaces_and_sessions(dsh_home);
        Self {
            config: RwLock::new(config),
            worker_status: RwLock::new(WorkerStatus::Idle),
            bridge_capabilities: RwLock::new(BridgeCapabilities::default()),
            sessions: RwLock::new(sessions),
            workspaces: RwLock::new(workspaces),
            active_worker_sessions: RwLock::new(HashSet::new()),
            adapter: Mutex::new(None),
            event_tx,
            storage_refresh: BlockingMutex::new(()),
            stopping: AtomicBool::new(false),
        }
    }

    pub fn snapshot(&self) -> AppStateSnapshot {
        let workspaces = self.workspaces.read().unwrap();
        let sessions = self.sessions.read().unwrap();
        self.snapshot_with_storage(&workspaces, &sessions)
    }

    fn snapshot_with_storage(
        &self,
        workspaces: &[WorkspaceSummary],
        sessions: &[SessionSummary],
    ) -> AppStateSnapshot {
        AppStateSnapshot {
            config: self.config.read().unwrap().clone(),
            worker_status: self.worker_status.read().unwrap().clone(),
            bridge_capabilities: *self.bridge_capabilities.read().unwrap(),
            sessions: sessions.to_vec(),
            workspaces: workspaces.to_vec(),
        }
    }

    pub fn refresh_storage(&self) -> AppStateSnapshot {
        self.refresh_storage_at(&storage::dsh_home_dir())
    }

    fn refresh_storage_at(&self, dsh_home: &Path) -> AppStateSnapshot {
        let _refresh = self.storage_refresh.lock().unwrap();
        let (disk_workspaces, disk_sessions) =
            storage::workspace::load_workspaces_and_sessions(dsh_home);
        let mut workspaces = self.workspaces.write().unwrap();
        let mut sessions = self.sessions.write().unwrap();
        *workspaces = disk_workspaces;
        *sessions = merge_sessions(disk_sessions, &sessions);
        self.snapshot_with_storage(&workspaces, &sessions)
    }

    pub fn session_summary(&self, session_id: &str) -> Result<SessionSummary, String> {
        self.sessions
            .read()
            .unwrap()
            .iter()
            .find(|session| session.session_id == session_id)
            .cloned()
            .ok_or_else(|| format!("Unknown session: {session_id}"))
    }

    pub async fn create_session(&self, cwd: &str) -> Result<SessionSummary, String> {
        // Register the session before a replacement worker reads the sessions to resume.
        let worker = self.adapter.lock().await;
        let adapter = worker
            .as_ref()
            .filter(|adapter| adapter.is_running())
            .ok_or_else(|| "dsh SDK worker is not running".to_string())?;
        let session_id = Uuid::new_v4().to_string();
        let cwd = adapter.set_working_directory(&session_id, cwd).await?;
        let now = now_millis();
        let session = SessionSummary {
            session_id,
            title: "New session".into(),
            cwd,
            status: SessionRunStatus::Idle,
            created_at: now,
            updated_at: now,
            pinned: false,
            archived: false,
            persisted: false,
        };
        self.sessions.write().unwrap().push(session.clone());
        self.active_worker_sessions
            .write()
            .unwrap()
            .insert(session.session_id.clone());
        Ok(session)
    }

    pub async fn ensure_session_resumed(
        &self,
        adapter: &SdkAdapter,
        session_id: &str,
    ) -> Result<(), String> {
        // Serialize resume RPCs and registration with worker replacement.
        let worker = self.adapter.lock().await;
        if !worker
            .as_ref()
            .is_some_and(|current| std::ptr::eq(current.as_ref(), adapter) && current.is_running())
            || self.stopping.load(Ordering::Acquire)
        {
            return Err("dsh SDK worker is not running".into());
        }
        if self.session_summary(session_id)?.persisted
            && !self
                .active_worker_sessions
                .read()
                .unwrap()
                .contains(session_id)
        {
            adapter.resume_session(session_id).await?;
            self.active_worker_sessions
                .write()
                .unwrap()
                .insert(session_id.into());
        }
        Ok(())
    }

    pub async fn launch_worker(&self, restart: bool) -> Result<WorkerStatus, String> {
        let mut adapter = self.adapter.lock().await;
        if self.stopping.load(Ordering::Acquire) {
            return Err("Application is shutting down".into());
        }
        if let Some(running) = adapter
            .as_ref()
            .filter(|adapter| !restart && adapter.is_running())
        {
            return Ok(running.ready_status().clone());
        }
        if let Some(previous) = adapter.take() {
            previous.shutdown().await;
        }
        self.active_worker_sessions.write().unwrap().clear();

        let config = self.config.read().unwrap().clone();
        let started = SdkAdapter::start(&config, self.event_tx.clone()).await?;
        let session_ids: Vec<_> = self
            .sessions
            .read()
            .unwrap()
            .iter()
            .filter(|session| !session.persisted)
            .map(|session| session.session_id.clone())
            .collect();
        for session_id in session_ids {
            match started.resume_session(&session_id).await {
                Ok(()) => {
                    self.active_worker_sessions
                        .write()
                        .unwrap()
                        .insert(session_id);
                }
                Err(error) => {
                    tracing::warn!(%error, %session_id, "Could not resume dsh SDK session");
                }
            }
        }
        let status = started.ready_status().clone();
        *adapter = Some(Arc::new(started));
        Ok(status)
    }

    pub async fn sdk(&self) -> Result<Arc<SdkAdapter>, String> {
        self.adapter
            .lock()
            .await
            .as_ref()
            .filter(|adapter| adapter.is_running() && !self.stopping.load(Ordering::Acquire))
            .cloned()
            .ok_or_else(|| "dsh SDK worker is not running".into())
    }

    pub async fn shutdown(&self) {
        self.stopping.store(true, Ordering::Release);
        if let Some(adapter) = self.adapter.lock().await.take() {
            adapter.shutdown().await;
        }
    }

    pub fn update_session(&self, session_id: &str, update: impl FnOnce(&mut SessionSummary)) {
        let mut sessions = self.sessions.write().unwrap();
        if let Some(session) = sessions
            .iter_mut()
            .find(|session| session.session_id == session_id)
        {
            update(session);
            session.updated_at = now_millis();
        }
    }
}

fn merge_sessions(disk: Vec<SessionSummary>, memory: &[SessionSummary]) -> Vec<SessionSummary> {
    let mut sessions: HashMap<_, _> = disk
        .into_iter()
        .map(|session| (session.session_id.clone(), session))
        .collect();
    for session in memory {
        if session.status == SessionRunStatus::Running {
            let mut running = session.clone();
            if let Some(saved) = sessions.get(&session.session_id) {
                running.persisted = saved.persisted;
                running.pinned = saved.pinned;
                running.archived = saved.archived;
            }
            sessions.insert(running.session_id.clone(), running);
        } else if !session.persisted {
            sessions
                .entry(session.session_id.clone())
                .or_insert_with(|| session.clone());
        }
    }
    let mut sessions: Vec<_> = sessions.into_values().collect();
    sessions.sort_unstable_by(|a, b| {
        b.updated_at
            .cmp(&a.updated_at)
            .then_with(|| a.session_id.cmp(&b.session_id))
    });
    sessions
}

pub(crate) fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::tests::TestHome;

    fn session(id: &str, persisted: bool) -> SessionSummary {
        SessionSummary {
            session_id: id.into(),
            title: "In memory".into(),
            cwd: "/work".into(),
            status: SessionRunStatus::Idle,
            created_at: 1,
            updated_at: 1,
            pinned: false,
            archived: false,
            persisted,
        }
    }

    #[test]
    fn merges_disk_sessions_with_unsaved_sessions() {
        let unsaved = session("unsaved", false);
        let mut saved = session("saved", true);
        saved.title = "On disk".into();
        saved.updated_at = 2;
        let history = session("history", true);
        let merged = merge_sessions(
            vec![saved.clone(), history.clone()],
            &[
                unsaved.clone(),
                session("saved", false),
                session("removed", true),
            ],
        );

        assert_eq!(merged, vec![saved, history, unsaved]);
    }

    #[test]
    fn refresh_storage_preserves_running_sessions() {
        let home = TestHome::new();
        let (event_tx, _) = mpsc::unbounded_channel();
        let state = AppState::new_with_storage(AppConfig::default(), event_tx, &home.0);
        let mut running = session("running", false);
        running.status = SessionRunStatus::Running;
        let mut missing = session("missing", true);
        missing.status = SessionRunStatus::Running;
        *state.sessions.write().unwrap() = vec![running.clone(), missing.clone()];
        home.write_log(
            "running",
            r#"{"type":"session","cwd":"/old","createdAt":1}"#,
        );
        home.write(
            "storages/workspace.json",
            br#"{"global":{"pinnedSessionIds":["running"]},"tables":{"workspaces":{"main":{"title":"Main","path":"/work","sessionIds":["running"]}}}}"#,
        );

        let snapshot = state.refresh_storage_at(&home.0);
        running.persisted = true;
        running.pinned = true;
        assert!(snapshot.sessions.contains(&running));
        assert!(snapshot.sessions.contains(&missing));
        assert_eq!(snapshot.sessions.len(), 2);
        assert_eq!(snapshot.workspaces[0].session_ids, ["running"]);
        assert_eq!(state.snapshot(), snapshot);
    }
}
