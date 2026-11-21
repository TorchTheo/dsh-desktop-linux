use std::path::Path;

use serde_json::Value;
use tauri::{AppHandle, Manager, State, Url};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::oneshot;

use crate::{
    config::AppConfig,
    domain::{
        AppStateSnapshot, ApprovalOutcome, ImageAttachment, ProviderModels, RewindResult,
        SessionModelSelection, SessionRunStatus, SessionSummary, UiSessionDetail, WorkerStatus,
        WorkspaceSummary,
    },
    state::AppState,
    storage::{self, snapshot},
};

#[tauri::command]
pub(crate) fn get_app_state(state: State<'_, AppState>) -> Result<AppStateSnapshot, String> {
    Ok(state.snapshot())
}

#[tauri::command]
pub(crate) fn list_workspaces(state: State<'_, AppState>) -> Result<Vec<WorkspaceSummary>, String> {
    Ok(state.workspaces.read().unwrap().clone())
}

#[tauri::command]
pub(crate) async fn refresh_sessions(app: AppHandle) -> Result<AppStateSnapshot, String> {
    tokio::task::spawn_blocking(move || app.state::<AppState>().refresh_storage())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn load_session_history(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<UiSessionDetail, String> {
    let empty_session = state
        .session_summary(&session_id)
        .ok()
        .filter(|session| !session.persisted && session.status == SessionRunStatus::Idle);
    tokio::task::spawn_blocking(move || {
        let home = storage::dsh_home_dir();
        let transcript = storage::transcript::load_session_transcript(&home, &session_id);
        let snapshot_count = snapshot::snapshot_count(&session_id);
        if let Some(session) = empty_session.filter(|_| {
            transcript.is_err()
                && storage::transcript::find_session_log_path(&home, &session_id).is_none()
        }) {
            return Ok(UiSessionDetail {
                session,
                messages: Vec::new(),
                provider: None,
                model: None,
                telemetry: crate::domain::SessionTelemetry {
                    snapshot_count,
                    ..Default::default()
                },
            });
        }
        transcript.map(|mut detail| {
            detail.telemetry.snapshot_count = snapshot_count;
            detail
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn resume_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<SessionSummary, String> {
    let adapter = state.sdk().await?;
    state.ensure_session_resumed(&adapter, &session_id).await?;
    state.session_summary(&session_id)
}

#[tauri::command]
pub(crate) async fn start_worker(state: State<'_, AppState>) -> Result<WorkerStatus, String> {
    state.launch_worker(false).await
}

#[tauri::command]
pub(crate) async fn restart_worker(state: State<'_, AppState>) -> Result<WorkerStatus, String> {
    state.launch_worker(true).await
}

#[tauri::command]
pub(crate) async fn create_session(
    state: State<'_, AppState>,
    cwd: Option<String>,
) -> Result<SessionSummary, String> {
    let cwd = cwd.unwrap_or_else(|| state.config.read().unwrap().default_cwd.clone());
    state.create_session(&cwd).await
}

#[tauri::command]
pub(crate) async fn send_query(
    state: State<'_, AppState>,
    session_id: String,
    text: String,
    images: Option<Vec<ImageAttachment>>,
    client_message_id: Option<String>,
) -> Result<Option<String>, String> {
    let adapter = state.sdk().await?;
    state.ensure_session_resumed(&adapter, &session_id).await?;
    if let Some(message_id) = client_message_id {
        let cwd = state.session_summary(&session_id)?.cwd;
        let snapshot_session = session_id.clone();
        tokio::task::spawn_blocking(move || {
            if let Some(tree_oid) = snapshot::capture_git_snapshot(Path::new(&cwd)) {
                if let Err(error) = snapshot::save_snapshot(&snapshot_session, message_id, tree_oid) {
                    tracing::warn!(%error, session_id = %snapshot_session, "Could not save workspace snapshot");
                }
            }
        })
        .await
        .map_err(|error| error.to_string())?;
    }
    adapter
        .send_query(&session_id, &text, images.unwrap_or_default())
        .await
}

#[tauri::command]
pub(crate) async fn rewind_session(
    state: State<'_, AppState>,
    session_id: String,
    target_message_id: String,
    restore_workspace: bool,
) -> Result<RewindResult, String> {
    let cwd = state.session_summary(&session_id)?.cwd;
    state.sdk().await?;
    let (workspace_restored, workspace_note) = if restore_workspace {
        let cwd = cwd.clone();
        tokio::task::spawn_blocking(move || {
            match snapshot::find_snapshot(&session_id, &target_message_id) {
                Ok(Some(tree_oid)) => {
                    match snapshot::restore_git_snapshot(Path::new(&cwd), &tree_oid) {
                        Ok(()) => (true, "工作区文件已回滚至发送前状态".into()),
                        Err(error) => (false, format!("工作区回滚失败：{error}")),
                    }
                }
                Ok(None) => (false, "未找到目标消息发送前的工作区快照".into()),
                Err(error) => (false, format!("无法读取工作区快照：{error}")),
            }
        })
        .await
        .map_err(|error| error.to_string())?
    } else {
        (false, "未请求回滚工作区".into())
    };
    let session = state.create_session(&cwd).await?;
    Ok(RewindResult {
        session,
        workspace_restored,
        workspace_note,
    })
}

#[tauri::command]
pub(crate) async fn abort_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<bool, String> {
    state.sdk().await?.abort_session(&session_id).await
}

#[tauri::command]
pub(crate) async fn list_models(state: State<'_, AppState>) -> Result<Vec<ProviderModels>, String> {
    state.sdk().await?.list_models().await
}

#[tauri::command]
pub(crate) async fn set_session_model(
    state: State<'_, AppState>,
    session_id: String,
    provider: String,
    model: String,
    reasoning_effort: Option<String>,
) -> Result<SessionModelSelection, String> {
    let adapter = state.sdk().await?;
    state.ensure_session_resumed(&adapter, &session_id).await?;
    adapter
        .set_session_model(&session_id, &provider, &model, reasoning_effort.as_deref())
        .await
}

#[tauri::command]
pub(crate) async fn respond_approval(
    state: State<'_, AppState>,
    request_id: String,
    outcome: ApprovalOutcome,
) -> Result<(), String> {
    state
        .sdk()
        .await?
        .respond_approval(&request_id, outcome)
        .await
}

#[tauri::command]
pub(crate) async fn respond_user_question(
    state: State<'_, AppState>,
    request_id: String,
    answer: Value,
) -> Result<(), String> {
    state
        .sdk()
        .await?
        .respond_user_question(&request_id, answer)
        .await
}

#[tauri::command]
pub(crate) async fn set_working_directory(
    state: State<'_, AppState>,
    session_id: String,
    path: String,
) -> Result<String, String> {
    let adapter = state.sdk().await?;
    state.ensure_session_resumed(&adapter, &session_id).await?;
    let cwd = adapter.set_working_directory(&session_id, &path).await?;
    state.update_session(&session_id, |session| session.cwd.clone_from(&cwd));
    Ok(cwd)
}

#[tauri::command]
pub(crate) async fn update_config(
    state: State<'_, AppState>,
    config: AppConfig,
) -> Result<AppConfig, String> {
    let mut current = state.config.write().unwrap();
    config.save().map_err(|error| error.to_string())?;
    *current = config.clone();
    Ok(config)
}

#[tauri::command]
pub(crate) async fn pick_directory(app: AppHandle) -> Result<Option<String>, String> {
    let (send, receive) = oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = send.send(folder);
    });
    receive
        .await
        .map_err(|_| "Directory picker closed before returning a result".to_string())?
        .map(|folder| {
            folder
                .into_path()
                .map(|path| path.to_string_lossy().into_owned())
                .map_err(|error| error.to_string())
        })
        .transpose()
}

#[tauri::command]
pub(crate) fn open_external_url(app: AppHandle, url: String) -> Result<(), String> {
    app.opener()
        .open_url(validate_external_url(&url)?.to_string(), None::<&str>)
        .map_err(|error| error.to_string())
}

fn validate_external_url(url: &str) -> Result<Url, String> {
    let (scheme, rest) = url.split_once(':').unwrap_or_default();
    let allowed = scheme.eq_ignore_ascii_case("mailto")
        || ((scheme.eq_ignore_ascii_case("http") || scheme.eq_ignore_ascii_case("https"))
            && rest.starts_with("//"));
    if !allowed {
        return Err("Only http://, https:// and mailto: URLs are allowed".into());
    }
    Url::parse(url).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::validate_external_url;

    #[test]
    fn external_urls_allow_only_web_and_mail_schemes() {
        for url in [
            "http://example.com",
            "HTTPS://example.com/path",
            "mailto:user@example.com",
        ] {
            assert!(validate_external_url(url).is_ok(), "{url}");
        }
        for url in [
            "file:///etc/hosts",
            "javascript:alert(1)",
            "data:text/plain,test",
            "ftp://example.com",
            "https+custom://example.com",
            "//example.com",
            "https:example.com",
            "https://",
        ] {
            assert!(validate_external_url(url).is_err(), "{url}");
        }
    }
}
