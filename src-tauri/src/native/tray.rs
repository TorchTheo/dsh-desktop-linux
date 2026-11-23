use std::sync::atomic::{AtomicBool, Ordering};

use ksni::{menu::StandardItem, Icon, MenuItem, Tray, TrayMethods};
use tauri::{AppHandle, Manager};

use crate::state::AppState;

#[derive(Default)]
pub(crate) struct ExitRequested(AtomicBool);

impl ExitRequested {
    pub(crate) fn is_set(&self) -> bool {
        self.0.load(Ordering::Acquire)
    }
}

struct DshTray {
    app: AppHandle,
}

impl Tray for DshTray {
    fn id(&self) -> String {
        "dsh-desktop".into()
    }

    fn title(&self) -> String {
        "DSH Desktop".into()
    }

    fn icon_pixmap(&self) -> Vec<Icon> {
        match tray_icon_pixmap() {
            Ok(icon) => vec![icon],
            Err(error) => {
                tracing::warn!(%error, "Could not decode tray icon");
                Vec::new()
            }
        }
    }

    fn activate(&mut self, _x: i32, _y: i32) {
        self.on_main_thread(show_and_focus_main_window);
    }

    fn menu(&self) -> Vec<MenuItem<Self>> {
        vec![
            StandardItem {
                label: "显示 / 隐藏窗口".into(),
                activate: Box::new(|tray: &mut Self| {
                    tray.on_main_thread(toggle_main_window);
                }),
                ..Default::default()
            }
            .into(),
            StandardItem {
                label: "重启 DSH 后端".into(),
                activate: Box::new(|tray: &mut Self| {
                    let app = tray.app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(error) = app.state::<AppState>().launch_worker(true).await {
                            tracing::warn!(%error, "Could not restart dsh SDK worker");
                        }
                    });
                }),
                ..Default::default()
            }
            .into(),
            MenuItem::Separator,
            StandardItem {
                label: "退出 DSH Desktop".into(),
                activate: Box::new(|tray: &mut Self| {
                    tray.on_main_thread(|app| {
                        app.state::<ExitRequested>()
                            .0
                            .store(true, Ordering::Release);
                        app.exit(0);
                    });
                }),
                ..Default::default()
            }
            .into(),
        ]
    }
}

impl DshTray {
    fn on_main_thread(&self, action: fn(&AppHandle)) {
        let app = self.app.clone();
        if let Err(error) = self.app.run_on_main_thread(move || action(&app)) {
            tracing::warn!(%error, "Could not dispatch tray action to main thread");
        }
    }
}

fn tray_icon_pixmap() -> Result<Icon, png::DecodingError> {
    let mut decoder = png::Decoder::new(std::io::Cursor::new(include_bytes!(
        "../../icons/32x32.png"
    )));
    decoder.set_transformations(
        png::Transformations::normalize_to_color8() | png::Transformations::ALPHA,
    );
    let mut reader = decoder.read_info()?;
    let mut data = vec![
        0;
        reader
            .output_buffer_size()
            .ok_or(png::DecodingError::LimitsExceeded)?
    ];
    let frame = reader.next_frame(&mut data)?;
    data.truncate(frame.buffer_size());
    for pixel in data.chunks_exact_mut(4) {
        pixel.rotate_right(1);
    }

    Ok(Icon {
        width: frame.width as i32,
        height: frame.height as i32,
        data,
    })
}

pub(crate) fn install(app: &AppHandle) -> tauri::Result<()> {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match (DshTray { app: app.clone() }).spawn().await {
            Ok(handle) => {
                app.manage(handle);
            }
            Err(error) => tracing::warn!(%error, "Could not start StatusNotifierItem tray"),
        }
    });
    Ok(())
}

fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false) {
            if let Err(error) = window.hide() {
                tracing::warn!(%error, "Could not hide main window");
            }
        } else {
            show_and_focus_main_window(app);
        }
    }
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

#[cfg(test)]
mod tests {
    use super::tray_icon_pixmap;

    #[test]
    fn decodes_tray_icon_into_argb32() {
        let icon = tray_icon_pixmap().expect("embedded tray icon should decode");

        assert_eq!((icon.width, icon.height), (32, 32));
        assert_eq!(icon.data.len(), 32 * 32 * 4);
        let center = (16 * 32 + 16) * 4;
        assert_eq!(&icon.data[center..center + 4], &[255, 132, 121, 144]);
    }
}
