mod commands;
pub mod config;
pub mod domain;
pub mod logging;
mod native;
pub mod protocol;
mod state;
pub mod storage;

use std::path::Path;

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};
use tokio::sync::mpsc;

use crate::{
    config::AppConfig,
    domain::{BridgeCapabilities, HostRuntimeInfo, SessionRunStatus, UiSessionEvent, WorkerStatus},
    native::{notify, tray},
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
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let directory = args
                .iter()
                .skip(1)
                .map(|arg| Path::new(&cwd).join(arg))
                .find(|path| path.is_dir());
            let handle = app.clone();
            if let Err(error) = app.run_on_main_thread(move || {
                tray::show_and_focus_main_window(&handle);
                if let Some(path) = directory {
                    if let Err(error) = handle.emit_to("main", "dsh://open-directory", path) {
                        tracing::warn!(%error, "Could not emit directory from second launch");
                    }
                }
            }) {
                tracing::warn!(%error, "Could not schedule second launch handling");
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState::new(config, event_tx))
        .manage(tray::ExitRequested::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_app_state,
            commands::get_host_info,
            commands::list_client_plugins,
            commands::proxy_host_http,
            commands::list_plugins,
            commands::set_plugin_bundle_enabled,
            commands::set_plugin_entry_enabled,
            commands::install_plugin_bundle,
            commands::remove_plugin_bundle,
            commands::list_workspaces,
            commands::refresh_sessions,
            commands::load_session_history,
            commands::resume_session,
            commands::start_worker,
            commands::restart_worker,
            commands::create_session,
            commands::send_query,
            commands::rewind_session,
            commands::abort_session,
            commands::list_models,
            commands::set_session_model,
            commands::set_session_permission,
            commands::respond_approval,
            commands::respond_user_question,
            commands::set_working_directory,
            commands::update_config,
            commands::pick_directory,
            commands::open_external_url,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main"
                    && !window.state::<tray::ExitRequested>().is_set()
                    && window
                        .state::<AppState>()
                        .config
                        .read()
                        .unwrap()
                        .close_to_tray
                {
                    api.prevent_close();
                    if let Err(error) = window.hide() {
                        tracing::warn!(%error, "Could not hide main window");
                    }
                }
            }
        })
        .setup(move |app| {
            tray::install(app.handle())?;
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
                    let capabilities = BridgeCapabilities::default();
                    *state.bridge_capabilities.write().unwrap() = capabilities;
                    if let Err(error) = app.emit("dsh://bridge-capabilities", capabilities) {
                        tracing::warn!(%error, "Could not emit bridge capabilities reset");
                    }
                    *state.host_info.write().unwrap() = None;
                    if let Err(error) = app.emit("dsh://host-info", None::<HostRuntimeInfo>) {
                        tracing::warn!(%error, "Could not emit host information reset");
                    }
                    for session in state.sessions.write().unwrap().iter_mut() {
                        session.status = SessionRunStatus::Idle;
                    }
                }
                app.emit("dsh://worker-status", status)
            }
            BackendEvent::BridgeCapabilities(capabilities) => {
                *state.bridge_capabilities.write().unwrap() = capabilities;
                app.emit("dsh://bridge-capabilities", capabilities)
            }
            BackendEvent::HostInfo(info) => {
                *state.host_info.write().unwrap() = info.clone();
                app.emit("dsh://host-info", info)
            }
            BackendEvent::StreamDelta(event) => app.emit("dsh://stream-delta", event),
            BackendEvent::SessionStatus { session_id, status } => {
                let mut completed = false;
                state.update_session(&session_id, |session| {
                    completed = session.status == SessionRunStatus::Running
                        && status == SessionRunStatus::Idle;
                    session.status = status.clone();
                });
                if completed {
                    notify::in_background(&app, "DSH 任务已完成", None);
                }
                app.emit(
                    "dsh://session-status",
                    json!({ "sessionId": session_id, "status": status }),
                )
            }
            BackendEvent::SessionTelemetry(mut event) => {
                let session_id = event.session_id.clone();
                event.telemetry.snapshot_count = tokio::task::spawn_blocking(move || {
                    storage::snapshot::snapshot_count(&session_id)
                })
                .await
                .unwrap_or_default();
                app.emit("dsh://session-telemetry", event)
            }
            BackendEvent::SessionEvent(event) => {
                if let UiSessionEvent::TitleUpdated { session_id, title } = &event {
                    state.update_session(session_id, |session| session.title.clone_from(title));
                }
                app.emit("dsh://session-event", event)
            }
            BackendEvent::ApprovalRequest(event) => {
                notify::in_background(
                    &app,
                    "DSH 需要工具审批",
                    Some(format!("工具：{}", event.tool_name)),
                );
                app.emit("dsh://approval-request", event)
            }
            BackendEvent::UserQuestion(event) => {
                notify::in_background(&app, "DSH 等待你的输入", None);
                app.emit("dsh://user-question", event)
            }
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
