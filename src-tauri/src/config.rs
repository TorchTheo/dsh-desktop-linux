use std::{
    env, fs,
    io::{self, Write},
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
};

use directories::BaseDirs;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppConfig {
    pub dsh_bin: String,
    pub provider: String,
    pub model: String,
    pub reasoning_effort: Option<String>,
    pub default_cwd: String,
    pub patches: Vec<String>,
    #[serde(default = "default_true")]
    pub enable_bridge: bool,
    #[serde(default = "default_true")]
    pub close_to_tray: bool,
    #[serde(default = "default_true")]
    pub desktop_notifications: bool,
    #[serde(deserialize_with = "deserialize_dmabuf_mode")]
    pub disable_dmabuf: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        let home = BaseDirs::new().map(|dirs| dirs.home_dir().to_path_buf());
        let patches = home
            .as_ref()
            .map(|home| home.join(".dsh/profiles/web/cordis.patch.yml"))
            .filter(|patch| patch.is_file())
            .map(|patch| patch.to_string_lossy().into_owned())
            .into_iter()
            .collect();

        Self {
            dsh_bin: String::new(),
            provider: "wb".into(),
            model: "cn:hy4flash-free".into(),
            reasoning_effort: None,
            default_cwd: home
                .or_else(|| env::current_dir().ok())
                .unwrap_or_else(|| PathBuf::from("/"))
                .to_string_lossy()
                .into_owned(),
            patches,
            enable_bridge: default_true(),
            close_to_tray: default_true(),
            desktop_notifications: default_true(),
            disable_dmabuf: "auto".into(),
        }
    }
}

fn default_true() -> bool {
    true
}

fn deserialize_dmabuf_mode<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<String, D::Error> {
    let mode = String::deserialize(deserializer)?;
    if valid_dmabuf_mode(&mode) {
        Ok(mode)
    } else {
        Err(serde::de::Error::custom("invalid disableDmabuf mode"))
    }
}

fn valid_dmabuf_mode(mode: &str) -> bool {
    matches!(mode, "auto" | "always" | "never")
}

pub fn config_path() -> io::Result<PathBuf> {
    BaseDirs::new()
        .map(|dirs| dirs.config_dir().join("dsh-desktop/config.toml"))
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                "configuration directory unavailable",
            )
        })
}

impl AppConfig {
    pub fn load_or_default() -> io::Result<Self> {
        match fs::read_to_string(config_path()?) {
            Ok(contents) => toml::from_str(&contents).map_err(|_| {
                io::Error::new(io::ErrorKind::InvalidData, "invalid desktop configuration")
            }),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Self::default()),
            Err(error) => Err(error),
        }
    }

    pub fn save(&self) -> io::Result<()> {
        if !valid_dmabuf_mode(&self.disable_dmabuf) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid disableDmabuf mode",
            ));
        }
        let contents = toml::to_string_pretty(self)
            .map_err(|_| io::Error::other("could not serialize desktop configuration"))?;
        let path = config_path()?;
        let directory = path.parent().expect("config path has a parent");
        fs::create_dir_all(directory)?;
        let temporary = directory.join(format!(".config-{}.tmp", uuid::Uuid::new_v4()));
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&temporary)?;
        let result = file
            .write_all(contents.as_bytes())
            .and_then(|()| file.sync_all())
            .and_then(|()| fs::rename(&temporary, &path));
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }

    pub fn resolve_bridge_patch(&self) -> Option<PathBuf> {
        const PATCH: &str = "bridge-plugin/desktop-bridge.patch.yml";
        const RESOURCE_DIR: &str = concat!("usr/lib/", env!("CARGO_PKG_NAME"));

        let exe_dir = env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(Path::to_path_buf));
        env::var_os("DSH_DESKTOP_BRIDGE_PATCH")
            .map(PathBuf::from)
            .into_iter()
            .chain(exe_dir.iter().map(|dir| dir.join(PATCH)))
            .chain(
                exe_dir
                    .iter()
                    .map(|dir| dir.join("../lib").join(env!("CARGO_PKG_NAME")).join(PATCH)),
            )
            .chain(
                env::var_os("APPDIR").map(|dir| PathBuf::from(dir).join(RESOURCE_DIR).join(PATCH)),
            )
            .chain([Path::new("/").join(RESOURCE_DIR).join(PATCH)])
            .chain([
                PathBuf::from(concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/../bridge-plugin/desktop-bridge.patch.yml"
                )),
                PathBuf::from(PATCH),
            ])
            .find(|candidate| candidate.is_file())
    }

    pub fn resolve_dsh_bin(&self) -> Option<PathBuf> {
        let path = env::var_os("PATH");
        let executable_on_path = |name: &Path| {
            path.iter()
                .flat_map(env::split_paths)
                .map(|directory| directory.join(name))
                .find(|candidate| is_executable(candidate))
        };

        std::iter::once(PathBuf::from(&self.dsh_bin))
            .chain(env::var_os("DSH_DESKTOP_BIN").map(PathBuf::from))
            .filter(|candidate| !candidate.as_os_str().is_empty())
            .find_map(|candidate| {
                if candidate.components().count() == 1 && !candidate.is_absolute() {
                    executable_on_path(&candidate)
                } else {
                    is_executable(&candidate).then_some(candidate)
                }
            })
            .or_else(|| executable_on_path(Path::new("dsh")))
            .or_else(|| {
                BaseDirs::new()
                    .map(|dirs| dirs.home_dir().join(".local/bin/dsh"))
                    .filter(|candidate| is_executable(candidate))
            })
            .and_then(|candidate| {
                if candidate.is_absolute() {
                    Some(candidate)
                } else {
                    env::current_dir().ok().map(|cwd| cwd.join(candidate))
                }
            })
    }
}

fn is_executable(path: &Path) -> bool {
    fs::metadata(path)
        .is_ok_and(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partial_config_inherits_defaults() {
        let config: AppConfig = toml::from_str("provider = 'custom'").unwrap();
        assert_eq!(config.provider, "custom");
        assert!(config.dsh_bin.is_empty());
        assert!(config.enable_bridge);
        assert!(config.close_to_tray);
        assert!(config.desktop_notifications);
        assert!(config.reasoning_effort.is_none());
        assert_eq!(config.disable_dmabuf, "auto");
        assert!(!config.default_cwd.is_empty());
        let expected_patches: Vec<_> = BaseDirs::new()
            .map(|dirs| dirs.home_dir().join(".dsh/profiles/web/cordis.patch.yml"))
            .filter(|patch| patch.is_file())
            .map(|patch| patch.to_string_lossy().into_owned())
            .into_iter()
            .collect();
        assert_eq!(config.patches, expected_patches);
    }

    #[test]
    fn config_rejects_unknown_dmabuf_mode() {
        assert!(toml::from_str::<AppConfig>("disableDmabuf = 'unsupported'").is_err());
    }

    #[test]
    fn config_round_trips_with_camel_case_keys() {
        let config = AppConfig {
            reasoning_effort: Some("high".into()),
            close_to_tray: false,
            desktop_notifications: false,
            ..AppConfig::default()
        };
        let encoded = toml::to_string(&config).unwrap();
        assert!(encoded.contains("disableDmabuf = \"auto\""));
        assert_eq!(toml::from_str::<AppConfig>(&encoded).unwrap(), config);
        let json = serde_json::to_value(&config).unwrap();
        assert_eq!(json["dshBin"], "");
        assert_eq!(json["reasoningEffort"], "high");
    }
}
