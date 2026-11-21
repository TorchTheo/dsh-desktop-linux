use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

use crate::state::AppState;

#[derive(Default)]
pub(crate) struct ExitRequested(AtomicBool);

impl ExitRequested {
    pub(crate) fn is_set(&self) -> bool {
        self.0.load(Ordering::Acquire)
    }
}

pub(crate) fn install(app: &AppHandle) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "显示 / 隐藏窗口", true, None::<&str>)?;
    let restart = MenuItem::with_id(app, "restart", "重启 DSH 后端", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出 DSH Desktop", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &restart, &separator, &quit])?;

    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle" => {
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false)
                        && !window.is_minimized().unwrap_or(false)
                    {
                        if let Err(error) = window.hide() {
                            tracing::warn!(%error, "Could not hide main window");
                        }
                    } else {
                        show_and_focus_main_window(app);
                    }
                }
            }
            "restart" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = app.state::<AppState>().launch_worker(true).await {
                        tracing::warn!(%error, "Could not restart dsh SDK worker");
                    }
                });
            }
            "quit" => {
                app.state::<ExitRequested>()
                    .0
                    .store(true, Ordering::Release);
                app.exit(0);
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

pub(crate) fn show_and_focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        for result in [window.unminimize(), window.show(), window.set_focus()] {
            if let Err(error) = result {
                tracing::warn!(%error, "Could not restore main window");
            }
        }
    }
}
