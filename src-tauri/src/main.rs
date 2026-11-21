#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{env, path::Path};

use dsh_desktop::config::AppConfig;

fn main() {
    let config = AppConfig::load_or_default().unwrap_or_default();
    configure_dmabuf(&config.disable_dmabuf);
    dsh_desktop::logging::init_logging();
    dsh_desktop::run();
}

fn configure_dmabuf(mode: &str) {
    const VARIABLE: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";
    if env::var_os(VARIABLE).is_none()
        && (mode == "always" || (mode == "auto" && is_wayland() && has_nvidia()))
    {
        env::set_var(VARIABLE, "1");
    }
}

fn is_wayland() -> bool {
    env::var_os("XDG_SESSION_TYPE").is_some_and(|session| session == "wayland")
        || env::var_os("WAYLAND_DISPLAY").is_some_and(|display| !display.is_empty())
}

fn has_nvidia() -> bool {
    Path::new("/proc/driver/nvidia/version").exists() || Path::new("/dev/nvidia0").exists()
}
