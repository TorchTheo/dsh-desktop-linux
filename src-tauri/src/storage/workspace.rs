use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use serde::Deserialize;
use serde_json::Value;

use crate::domain::{SessionRunStatus, SessionSummary, WorkspaceSummary};

use super::transcript::{read_log, session_log_path};

const UNTITLED: &str = "Untitled session";

#[derive(Default, Deserialize)]
#[serde(default)]
struct WorkspaceStore {
    global: SessionFlags,
    tables: WorkspaceTables,
}

#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub(super) struct SessionFlags {
    pinned_session_ids: HashSet<String>,
    archived_session_ids: HashSet<String>,
}

#[derive(Default, Deserialize)]
#[serde(default)]
struct WorkspaceTables {
    workspaces: BTreeMap<String, Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceRecord {
    title: String,
    path: String,
    #[serde(default)]
    session_ids: Vec<String>,
}

impl WorkspaceStore {
    fn load(dsh_home: &Path) -> Self {
        fs::read(dsh_home.join("storages/workspace.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }
}

impl SessionFlags {
    pub(super) fn load(dsh_home: &Path) -> Self {
        WorkspaceStore::load(dsh_home).global
    }

    pub(super) fn summary(
        &self,
        session_id: &str,
        identity: &Value,
        rows: &Value,
        path: &Path,
    ) -> SessionSummary {
        let created_at = identity["createdAt"].as_u64().unwrap_or_default();
        let updated_at = fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .ok()
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .and_then(|elapsed| elapsed.as_millis().try_into().ok())
            .unwrap_or(created_at);
        SessionSummary {
            session_id: session_id.into(),
            title: rows["title"]["val"]
                .as_str()
                .filter(|title| !title.trim().is_empty())
                .unwrap_or(UNTITLED)
                .into(),
            cwd: rows["workingDirectory"]["val"]
                .as_str()
                .or_else(|| identity["cwd"].as_str())
                .unwrap_or_default()
                .into(),
            status: SessionRunStatus::Idle,
            created_at,
            updated_at,
            pinned: self.pinned_session_ids.contains(session_id),
            archived: self.archived_session_ids.contains(session_id),
            persisted: true,
        }
    }

    pub(super) fn cached_summary(&self, session_id: &str, path: &Path) -> Option<SessionSummary> {
        let cache: Value = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
        let record = cache.get("record")?;
        record.as_object()?;
        Some(self.summary(session_id, &record["identity"], &record["rows"], path))
    }
}

pub(super) fn cache_directory(dsh_home: &Path) -> PathBuf {
    dsh_home.join("storages/session_projcache/sessions")
}

pub(super) fn directory_entries(path: &Path) -> impl Iterator<Item = fs::DirEntry> {
    fs::read_dir(path)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
}

pub fn load_workspaces_and_sessions(
    dsh_home: &Path,
) -> (Vec<WorkspaceSummary>, Vec<SessionSummary>) {
    let WorkspaceStore { global, tables } = WorkspaceStore::load(dsh_home);
    let workspaces = tables
        .workspaces
        .into_iter()
        .filter_map(|(id, value)| {
            let row: WorkspaceRecord = serde_json::from_value(value).ok()?;
            Some(WorkspaceSummary {
                id,
                title: row.title,
                path: row.path,
                session_ids: row.session_ids,
            })
        })
        .collect();

    let mut sessions = HashMap::new();
    for entry in directory_entries(&cache_directory(dsh_home)) {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "json") {
            if let Some(summary) = path
                .file_stem()
                .and_then(|id| id.to_str())
                .and_then(|id| global.cached_summary(id, &path))
            {
                sessions.insert(summary.session_id.clone(), summary);
            }
        }
    }
    for project in directory_entries(&dsh_home.join("sessions")) {
        for entry in directory_entries(&project.path()) {
            let name = entry.file_name();
            let Some(id) = name.to_str().filter(|id| !sessions.contains_key(*id)) else {
                continue;
            };
            let path = session_log_path(&entry.path());
            if !path.is_file() {
                continue;
            }
            let header = read_log(&path)
                .ok()
                .and_then(|lines| {
                    lines
                        .map_while(Result::ok)
                        .find_map(|line| serde_json::from_slice::<Value>(&line).ok())
                })
                .filter(|event| event["type"] == "session")
                .unwrap_or_default();
            sessions.insert(
                id.to_owned(),
                global.summary(id, &header, &Value::Null, &path),
            );
        }
    }

    let mut sessions: Vec<_> = sessions.into_values().collect();
    sessions.sort_unstable_by(|a, b| {
        b.updated_at
            .cmp(&a.updated_at)
            .then_with(|| a.session_id.cmp(&b.session_id))
    });
    (workspaces, sessions)
}

#[cfg(test)]
mod tests {
    use std::{fs::FileTimes, time::Duration};

    use super::*;
    use crate::storage::tests::TestHome;

    #[test]
    fn loads_workspace_and_merges_cache_with_log_only_sessions() {
        let home = TestHome::new();
        home.write(
            "storages/workspace.json",
            br#"{
                "global":{"pinnedSessionIds":["cached"],"archivedSessionIds":["history"]},
                "tables":{"workspaces":{
                    "main":{"title":"Main","path":"/work","sessionIds":["cached","history"]},
                    "broken":null
                }}
            }"#,
        );
        let cached = home.write(
            "storages/session_projcache/sessions/cached.json",
            br#"{"record":{"identity":{"cwd":"/initial","createdAt":42},"rows":{
                "workingDirectory":{"val":"/work"},"title":{"val":"Cached title"}
            }}}"#,
        );
        let legacy = home.write(
            "storages/session_projcache/sessions/legacy.json",
            br#"{"record":{"identity":{"cwd":"/legacy","createdAt":99},"rows":{
                "workingDirectory":{"val":null},"title":{"val":" "}
            }}}"#,
        );
        home.write("storages/session_projcache/sessions/history.json", b"{");
        home.write_log("cached", r#"{"type":"session","cwd":"/log","createdAt":1}"#);
        let history = home.write_log(
            "history",
            r#"{"type":"session","cwd":"/history","createdAt":73}"#,
        );
        for (path, seconds) in [(cached, 100), (history, 200), (legacy, 300)] {
            fs::File::open(path)
                .unwrap()
                .set_times(FileTimes::new().set_modified(UNIX_EPOCH + Duration::from_secs(seconds)))
                .unwrap();
        }

        let (workspaces, sessions) = load_workspaces_and_sessions(&home.0);
        assert_eq!(
            workspaces,
            vec![WorkspaceSummary {
                id: "main".into(),
                title: "Main".into(),
                path: "/work".into(),
                session_ids: vec!["cached".into(), "history".into()],
            }]
        );
        assert_eq!(sessions.len(), 3);
        let history = &sessions[1];
        assert_eq!(history.session_id, "history");
        assert_eq!(
            (&*history.cwd, history.created_at, history.updated_at),
            ("/history", 73, 200_000)
        );
        assert!(history.archived && !history.pinned);
        let cached = &sessions[2];
        assert_eq!((&*cached.title, &*cached.cwd), ("Cached title", "/work"));
        assert_eq!((cached.created_at, cached.updated_at), (42, 100_000));
        assert!(cached.pinned && !cached.archived);
        assert_eq!(
            (&*sessions[0].title, &*sessions[0].cwd),
            (UNTITLED, "/legacy")
        );
        assert!(sessions
            .iter()
            .all(|session| session.persisted && session.status == SessionRunStatus::Idle));
    }

    #[test]
    fn tolerates_missing_and_invalid_workspace_metadata() {
        let home = TestHome::new();
        assert_eq!(load_workspaces_and_sessions(&home.0), (vec![], vec![]));
        home.write("storages/workspace.json", b"{");
        home.write_log("history", r#"{"type":"session"}"#);
        let (workspaces, sessions) = load_workspaces_and_sessions(&home.0);
        assert!(workspaces.is_empty());
        assert_eq!(sessions.len(), 1);
        assert!(!sessions[0].pinned && !sessions[0].archived);
    }
}
