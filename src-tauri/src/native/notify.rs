use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::state::AppState;

pub(crate) fn in_background(app: &AppHandle, title: &str, body: Option<String>) {
    if !app
        .state::<AppState>()
        .config
        .read()
        .unwrap()
        .desktop_notifications
    {
        return;
    }

    if let Some(window) = app.get_webview_window("main") {
        if !matches!(window.is_visible(), Ok(false)) && !matches!(window.is_focused(), Ok(false)) {
            return;
        }
    }

    let mut notification = app.notification().builder().title(title);
    if let Some(body) = body {
        notification = notification.body(body);
    }
    if let Err(error) = notification.show() {
        tracing::warn!(%error, "Could not show desktop notification");
    }
}
