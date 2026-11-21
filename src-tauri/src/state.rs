use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, RwLock,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use tokio::sync::{mpsc, Mutex};

use crate::{
    config::AppConfig,
    domain::{AppStateSnapshot, SessionSummary, WorkerStatus},
    protocol::{sdk_adapter::SdkAdapter, BackendEvent},
};

pub(crate) struct AppState {
    pub config: RwLock<AppConfig>,
    pub worker_status: RwLock<WorkerStatus>,
    pub sessions: RwLock<Vec<SessionSummary>>,
    pub adapter: Mutex<Option<Arc<SdkAdapter>>>,
    pub event_tx: mpsc::UnboundedSender<BackendEvent>,
    stopping: AtomicBool,
}

impl AppState {
    pub fn new(config: AppConfig, event_tx: mpsc::UnboundedSender<BackendEvent>) -> Self {
        Self {
            config: RwLock::new(config),
            worker_status: RwLock::new(WorkerStatus::Idle),
            sessions: RwLock::new(Vec::new()),
            adapter: Mutex::new(None),
            event_tx,
            stopping: AtomicBool::new(false),
        }
    }

    pub fn snapshot(&self) -> AppStateSnapshot {
        AppStateSnapshot {
            config: self.config.read().unwrap().clone(),
            worker_status: self.worker_status.read().unwrap().clone(),
            sessions: self.sessions.read().unwrap().clone(),
        }
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

        let config = self.config.read().unwrap().clone();
        let started = SdkAdapter::start(&config, self.event_tx.clone()).await?;
        let session_ids: Vec<_> = self
            .sessions
            .read()
            .unwrap()
            .iter()
            .map(|session| session.session_id.clone())
            .collect();
        for session_id in session_ids {
            if let Err(error) = started.resume_session(&session_id).await {
                tracing::warn!(%error, %session_id, "Could not resume dsh SDK session");
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

pub(crate) fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
