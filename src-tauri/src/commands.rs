use serde_json::Value;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::{
    config::AppConfig,
    domain::{
        AppStateSnapshot, ApprovalOutcome, ImageAttachment, SessionRunStatus, SessionSummary,
        WorkerStatus,
    },
    state::{now_millis, AppState},
};

#[tauri::command]
pub(crate) fn get_app_state(state: State<'_, AppState>) -> Result<AppStateSnapshot, String> {
    Ok(state.snapshot())
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
    // Register the session before a replacement worker reads the sessions to resume.
    let worker = state.adapter.lock().await;
    let adapter = worker
        .as_ref()
        .filter(|adapter| adapter.is_running())
        .ok_or_else(|| "dsh SDK worker is not running".to_string())?;
    let session_id = Uuid::new_v4().to_string();
    let cwd = cwd.unwrap_or_else(|| state.config.read().unwrap().default_cwd.clone());
    let cwd = adapter.set_working_directory(&session_id, &cwd).await?;
    let now = now_millis();
    let session = SessionSummary {
        session_id,
        title: "New session".into(),
        cwd,
        status: SessionRunStatus::Idle,
        created_at: now,
        updated_at: now,
    };
    state.sessions.write().unwrap().push(session.clone());
    Ok(session)
}

#[tauri::command]
pub(crate) async fn send_query(
    state: State<'_, AppState>,
    session_id: String,
    text: String,
    images: Option<Vec<ImageAttachment>>,
) -> Result<Option<String>, String> {
    state
        .sdk()
        .await?
        .send_query(&session_id, &text, images.unwrap_or_default())
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
    let cwd = state
        .sdk()
        .await?
        .set_working_directory(&session_id, &path)
        .await?;
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
