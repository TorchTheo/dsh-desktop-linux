pub mod snapshot;
pub mod transcript;
pub mod workspace;

use std::{
    env,
    path::{Path, PathBuf},
};

use directories::BaseDirs;

pub fn dsh_home_dir() -> PathBuf {
    env::var_os("DSH_HOME")
        .map(PathBuf::from)
        .or_else(|| BaseDirs::new().map(|dirs| dirs.home_dir().join(".dsh")))
        .unwrap_or_else(|| PathBuf::from(".dsh"))
}

fn session_id_component(session_id: &str) -> bool {
    Path::new(session_id)
        .file_name()
        .is_some_and(|name| name == session_id)
}

#[cfg(test)]
pub(crate) mod tests {
    use std::{env, fs, path::PathBuf};

    use uuid::Uuid;

    pub(crate) struct TestHome(pub PathBuf);

    impl TestHome {
        pub(crate) fn new() -> Self {
            let path = env::temp_dir().join(format!("dsh-storage-test-{}", Uuid::new_v4()));
            fs::create_dir(&path).unwrap();
            Self(path)
        }

        pub(crate) fn write(&self, relative: &str, contents: &[u8]) -> PathBuf {
            let path = self.0.join(relative);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, contents).unwrap();
            path
        }

        pub(crate) fn write_log(&self, id: &str, contents: &str) -> PathBuf {
            let compressed = zstd::stream::encode_all(contents.as_bytes(), 1).unwrap();
            self.write(
                &format!("sessions/project/{id}/session.v4.jsonl.zstd"),
                &compressed,
            )
        }
    }

    impl Drop for TestHome {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
}
