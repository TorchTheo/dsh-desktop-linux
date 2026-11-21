mod commands;
pub mod config;
pub mod domain;
pub mod logging;
pub mod protocol;
mod state;
pub mod storage;

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, RunEvent};
use tokio::sync::mpsc;

use crate::{
    config::AppConfig,
    domain::{SessionRunStatus, UiSessionEvent, WorkerStatus},
    protocol::BackendEvent,
    state::AppState,
};

pub fn run() {
    let config = AppConfig::load_or_default().unwrap_or_else(|error| {
        tracing::warn!(%error, "Using default desktop configuration");
        AppConfig::default()
    });
    let (event_tx, event_rx) = mpsc::unbounded_channel();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new(config, event_tx))
        .invoke_handler(tauri::generate_handler![
            commands::get_app_state,
            commands::start_worker,
            commands::restart_worker,
            commands::create_session,
            commands::send_query,
            commands::respond_approval,
            commands::respond_user_question,
            commands::set_working_directory,
            commands::update_config,
            commands::pick_directory,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(forward_events(handle.clone(), event_rx));
            tauri::async_runtime::spawn(async move {
                if let Err(error) = handle.state::<AppState>().launch_worker(false).await {
                    tracing::warn!(%error, "Could not start dsh SDK worker");
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) {
                tauri::async_runtime::block_on(app.state::<AppState>().shutdown());
            }
        });
}

async fn forward_events(app: AppHandle, mut events: mpsc::UnboundedReceiver<BackendEvent>) {
    let state = app.state::<AppState>();
    while let Some(event) = events.recv().await {
        let result = match event {
            BackendEvent::WorkerStatus(status) => {
                *state.worker_status.write().unwrap() = status.clone();
                if matches!(status, WorkerStatus::Stopped | WorkerStatus::Error { .. }) {
                    for session in state.sessions.write().unwrap().iter_mut() {
                        session.status = SessionRunStatus::Idle;
                    }
                }
                app.emit("dsh://worker-status", status)
            }
            BackendEvent::SessionStatus { session_id, status } => {
                state.update_session(&session_id, |session| session.status = status.clone());
                app.emit(
                    "dsh://session-status",
                    json!({ "sessionId": session_id, "status": status }),
                )
            }
            BackendEvent::SessionEvent(event) => {
                if let UiSessionEvent::TitleUpdated { session_id, title } = &event {
                    state.update_session(session_id, |session| session.title.clone_from(title));
                }
                app.emit("dsh://session-event", event)
            }
            BackendEvent::ApprovalRequest(event) => app.emit("dsh://approval-request", event),
            BackendEvent::UserQuestion(event) => app.emit("dsh://user-question", event),
            BackendEvent::UserQuestionCancelled(event) => {
                app.emit("dsh://user-question-cancelled", event)
            }
            BackendEvent::Subagent(event) => app.emit("dsh://subagent-update", event),
        };
        if let Err(error) = result {
            tracing::warn!(%error, "Could not emit backend event");
        }
    }
}
