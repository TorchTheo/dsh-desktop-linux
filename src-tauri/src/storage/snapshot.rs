use std::{
    fs, io,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};

use directories::BaseDirs;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::state::now_millis;

use super::session_id_component;

static SNAPSHOT_WRITES: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize)]
struct Snapshot {
    message_id: String,
    tree_oid: String,
    created_at: u64,
}

struct TemporaryIndex(PathBuf);

impl TemporaryIndex {
    fn new() -> io::Result<Self> {
        let dir = std::env::temp_dir().join(format!("dsh-git-index-{}", Uuid::new_v4()));
        fs::create_dir(&dir)?;
        Ok(Self(dir))
    }

    fn git(&self, cwd: &Path) -> Command {
        let mut command = Command::new("git");
        command
            .arg("-C")
            .arg(cwd)
            .env("GIT_INDEX_FILE", self.0.join("index"));
        command
    }
}

impl Drop for TemporaryIndex {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn git_output(mut command: Command, args: &[&str]) -> Result<String, String> {
    let output = command
        .args(args)
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(format!(
            "git {}: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    String::from_utf8(output.stdout)
        .map(|value| value.trim_end_matches('\n').to_owned())
        .map_err(|error| error.to_string())
}

fn valid_tree_oid(oid: &str) -> bool {
    oid.len() == 40 && oid.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn workspace_index(cwd: &Path) -> Result<(PathBuf, TemporaryIndex), String> {
    if cwd.as_os_str().is_empty() {
        return Err("会话没有工作目录".into());
    }
    let git = || {
        let mut command = Command::new("git");
        command.arg("-C").arg(cwd).env_remove("GIT_INDEX_FILE");
        command
    };
    if git_output(git(), &["rev-parse", "--is-inside-work-tree"])? != "true" {
        return Err("当前目录不在 Git 工作区内".into());
    }
    let root = PathBuf::from(git_output(git(), &["rev-parse", "--show-toplevel"])?);
    let real_index = git_output(
        git(),
        &["rev-parse", "--path-format=absolute", "--git-path", "index"],
    )?;
    let temp = TemporaryIndex::new().map_err(|error| error.to_string())?;
    // Preserve Git's set of tracked paths, including tracked files matched by ignore rules.
    match fs::copy(real_index, temp.0.join("index")) {
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    Ok((root, temp))
}

pub fn capture_git_snapshot(cwd: &Path) -> Option<String> {
    let (root, index) = workspace_index(cwd).ok()?;
    git_output(index.git(&root), &["add", "-A"]).ok()?;
    let oid = git_output(index.git(&root), &["write-tree"]).ok()?;
    valid_tree_oid(&oid).then_some(oid)
}

pub fn restore_git_snapshot(cwd: &Path, tree_oid: &str) -> Result<(), String> {
    if !valid_tree_oid(tree_oid) {
        return Err("无效的 Git 快照标识".into());
    }
    let (root, index) = workspace_index(cwd)?;
    git_output(index.git(&root), &["read-tree", "--reset", "-u", tree_oid])?;
    git_output(index.git(&root), &["clean", "-fd"])?;
    Ok(())
}

fn snapshot_path(session_id: &str) -> Result<PathBuf, String> {
    if !session_id_component(session_id) {
        return Err("无效的会话标识".into());
    }
    let dirs = BaseDirs::new().ok_or("无法定位用户主目录")?;
    Ok(dirs
        .home_dir()
        .join(".local/share/dsh-desktop/snapshots")
        .join(format!("{session_id}.json")))
}

fn read_index(path: &Path) -> Result<Vec<Snapshot>, String> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|error| error.to_string()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error.to_string()),
    }
}

pub fn save_snapshot(session_id: &str, message_id: String, tree_oid: String) -> Result<(), String> {
    let _lock = SNAPSHOT_WRITES.lock().unwrap();
    let path = snapshot_path(session_id)?;
    let mut snapshots = read_index(&path)?;
    if snapshots
        .iter()
        .any(|snapshot| snapshot.message_id == message_id)
    {
        return Ok(());
    }
    snapshots.push(Snapshot {
        message_id,
        tree_oid,
        created_at: now_millis(),
    });
    let bytes = serde_json::to_vec(&snapshots).map_err(|error| error.to_string())?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|error| error.to_string())?;
    let temp = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    let result = fs::write(&temp, bytes).and_then(|()| fs::rename(&temp, &path));
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result.map_err(|error| error.to_string())
}

pub fn snapshot_count(session_id: &str) -> usize {
    snapshot_path(session_id)
        .and_then(|path| read_index(&path))
        .map_or(0, |snapshots| snapshots.len())
}

pub fn find_snapshot(session_id: &str, message_id: &str) -> Result<Option<String>, String> {
    Ok(read_index(&snapshot_path(session_id)?)?
        .into_iter()
        .find(|snapshot| snapshot.message_id == message_id)
        .map(|snapshot| snapshot.tree_oid))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::tests::TestHome;

    #[test]
    fn restores_workspace_without_changing_head_index_or_stash() {
        let home = TestHome::new();
        let git = |args: &[&str]| {
            let mut command = Command::new("git");
            command.arg("-C").arg(&home.0);
            git_output(command, args).unwrap()
        };
        git(&["init", "--quiet"]);
        home.write(".gitignore", b"ignored/\n");
        let tracked = home.write("tracked", b"committed");
        let deleted = home.write("deleted", b"restore me");
        git(&["add", "-A"]);
        git(&[
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.com",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "-qm",
            "initial",
        ]);
        let head = git(&["rev-parse", "HEAD"]);
        fs::write(&tracked, b"staged").unwrap();
        git(&["add", "tracked"]);
        let index = fs::read(home.0.join(".git/index")).unwrap();
        fs::write(&tracked, b"before").unwrap();
        let existing = home.write("subdir/existing", b"untracked before");
        let oid = capture_git_snapshot(existing.parent().unwrap()).unwrap();
        assert_eq!(fs::read(home.0.join(".git/index")).unwrap(), index);

        fs::write(&tracked, b"after").unwrap();
        fs::remove_file(&deleted).unwrap();
        fs::remove_file(&existing).unwrap();
        let added = home.write("new/file", b"remove me");
        let ignored = home.write("ignored/cache", b"preserve me");
        restore_git_snapshot(&home.0, &oid).unwrap();

        assert_eq!(fs::read(tracked).unwrap(), b"before");
        assert_eq!(fs::read(deleted).unwrap(), b"restore me");
        assert_eq!(fs::read(existing).unwrap(), b"untracked before");
        assert!(!added.parent().unwrap().exists());
        assert_eq!(fs::read(ignored).unwrap(), b"preserve me");
        assert_eq!(fs::read(home.0.join(".git/index")).unwrap(), index);
        assert_eq!(git(&["rev-parse", "HEAD"]), head);
        assert!(git(&["stash", "list"]).is_empty());
    }
}
