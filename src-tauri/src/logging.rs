use tracing_subscriber::{filter::LevelFilter, EnvFilter};

pub fn init_logging() {
    let filter = EnvFilter::builder()
        .with_default_directive(LevelFilter::INFO.into())
        .from_env_lossy();
    let _ = tracing_subscriber::fmt().with_env_filter(filter).try_init();
}
