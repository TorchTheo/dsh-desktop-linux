pub mod config;
pub mod domain;
pub mod logging;
pub mod protocol;

pub fn run() {
    logging::init_logging();
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
