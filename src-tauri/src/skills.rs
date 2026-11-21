use std::{
    env,
    fs::{self, OpenOptions},
    io::{self, Read, Write},
    os::unix::fs::OpenOptionsExt,
    path::{Path, PathBuf},
};

use serde::Deserialize;

use crate::domain::SkillInfo;

const SKILL_FILE: &str = "SKILL.md";
const MAX_BYTES: usize = 1024 * 1024;

pub(crate) struct SkillRoots {
    user: PathBuf,
    workspace: Option<PathBuf>,
}

#[derive(Deserialize)]
struct Frontmatter {
    name: String,
    description: String,
}

impl SkillRoots {
    pub(crate) fn new(cwd: Option<&str>) -> Result<Self, String> {
        let home = directories::BaseDirs::new().map(|dirs| dirs.home_dir().to_path_buf());
        let dsh_home = match env::var_os("DSH_HOME")
            .filter(|value| !value.to_string_lossy().trim().is_empty())
        {
            Some(value) => {
                let path = PathBuf::from(value);
                match (path.strip_prefix("~"), &home) {
                    (Ok(rest), Some(home)) => home.join(rest),
                    _ => path,
                }
            }
            None => home
                .ok_or("Could not resolve the user home directory")?
                .join(".dsh"),
        };
        let workspace = cwd
            .map(|cwd| {
                let path = fs::canonicalize(cwd)
                    .map_err(|error| format!("Invalid workspace directory: {error}"))?;
                if !path.is_dir() {
                    return Err("Workspace must be a directory".to_owned());
                }
                Ok(path)
            })
            .transpose()?;
        Ok(Self {
            user: env::current_dir()
                .map(|cwd| cwd.join(dsh_home))
                .map_err(|error| error.to_string())?
                .join("skills"),
            workspace,
        })
    }

    fn managed(&self) -> Vec<(PathBuf, &'static str)> {
        let mut roots = vec![(self.user.clone(), "user-dsh")];
        if let Some(cwd) = &self.workspace {
            roots.push((cwd.join(".dsh/skills"), "project-dsh"));
        }
        roots
    }

    pub(crate) fn merge(&self, mut skills: Vec<SkillInfo>) -> Vec<SkillInfo> {
        // The registry can still hold rows for a recently deleted directory.
        skills.retain(|skill| {
            !matches!(skill.source.as_str(), "user-dsh" | "project-dsh")
                || Path::new(&skill.path).is_file()
        });

        let roots: Vec<_> = self
            .managed()
            .into_iter()
            .filter_map(|(path, source)| Some((checked_root(&path, false).ok()?, source)))
            .collect();
        // The bridge also reports shared .agents skills and Git-root skills.
        // Editing through this IPC is confined to the two DSH roots for this cwd.
        for skill in &mut skills {
            let path = Path::new(&skill.path);
            skill.editable &= roots
                .iter()
                .any(|(root, _)| path.parent().and_then(Path::parent) == Some(root.as_path()));
        }
        for (root, source) in roots {
            let Ok(entries) = fs::read_dir(&root) else {
                continue;
            };
            for entry in entries.flatten() {
                let Ok(kind) = entry.file_type() else {
                    continue;
                };
                let path = if kind.is_dir() && entry.file_name() != ".system" {
                    entry.path().join(SKILL_FILE)
                } else if kind.is_file() && entry.path().extension().is_some_and(|ext| ext == "md")
                {
                    entry.path()
                } else {
                    continue;
                };
                let Ok(content) = read(&path) else {
                    continue;
                };
                let Ok(metadata) = parse_frontmatter(&content) else {
                    continue;
                };
                let mut skill = skill_info(metadata, source, &path);
                skill.editable = kind.is_dir();
                if let Some(existing) = skills
                    .iter_mut()
                    .find(|existing| existing.path == skill.path)
                {
                    *existing = skill;
                } else {
                    skills.push(skill);
                }
            }
        }
        skills.sort_by(|a, b| a.name.cmp(&b.name).then(a.path.cmp(&b.path)));
        skills
    }

    pub(crate) fn save(
        &self,
        name: &str,
        description: &str,
        content: &str,
        scope: &str,
    ) -> Result<SkillInfo, String> {
        if name.is_empty()
            || !name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        {
            return Err("Skill name must contain only letters, digits, '-' or '_'".into());
        }

        let (root, source) = if scope == "workspace" {
            let cwd = self
                .workspace
                .as_ref()
                .ok_or("Workspace scope requires a working directory")?;
            (cwd.join(".dsh/skills"), "project-dsh")
        } else {
            (self.user.clone(), "user-dsh")
        };

        let content = if content.lines().next() == Some("---") {
            content.to_owned()
        } else {
            // JSON string literals are valid YAML double-quoted scalars.
            let name = serde_json::to_string(name).map_err(|error| error.to_string())?;
            let description =
                serde_json::to_string(description).map_err(|error| error.to_string())?;
            format!("---\nname: {name}\ndescription: {description}\n---\n\n{content}")
        };
        if content.len() > MAX_BYTES {
            return Err("Skill content exceeds 1 MiB".into());
        }
        let metadata = parse_frontmatter(&content)?;

        let root = checked_root(&root, true).map_err(skill_io)?;
        let directory = root.join(name);
        ensure_real_directory(&directory, true).map_err(skill_io)?;
        let path = directory.join(SKILL_FILE);
        let mut file = tempfile::NamedTempFile::new_in(&directory).map_err(skill_io)?;
        file.write_all(content.as_bytes()).map_err(skill_io)?;
        file.persist(&path).map_err(|error| skill_io(error.error))?;
        Ok(skill_info(metadata, source, &path))
    }

    pub(crate) fn delete(&self, path: &Path) -> Result<(), String> {
        if !path.file_name().is_some_and(|name| name == SKILL_FILE) {
            return Err("Expected the path to a SKILL.md file".into());
        }
        let original = env::current_dir().map_err(skill_io)?.join(path);
        let canonical = fs::canonicalize(path).map_err(skill_io)?;
        let directory = canonical.parent().ok_or("Skill directory is missing")?;
        if original != canonical
            || !canonical.is_file()
            || directory.file_name().is_some_and(|name| name == ".system")
            || !self.managed().iter().any(|(root, _)| {
                checked_root(root, false)
                    .is_ok_and(|root| directory.parent() == Some(root.as_path()))
            })
        {
            return Err(
                "Only skill bundles directly inside a DSH skill directory can be deleted".into(),
            );
        }
        fs::remove_dir_all(directory).map_err(skill_io)
    }
}

pub(crate) fn read(path: &Path) -> Result<String, String> {
    let bundle = path.file_name().is_some_and(|name| name == SKILL_FILE);
    let flat = path.extension().is_some_and(|ext| ext == "md")
        && path
            .parent()
            .and_then(Path::file_name)
            .is_some_and(|name| name == "skills");
    if !bundle && !flat {
        return Err("Expected a SKILL.md file or a flat Markdown skill".into());
    }
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .open(path)
        .map_err(skill_io)?;
    if !file.metadata().map_err(skill_io)?.is_file() {
        return Err("Skill path must be a regular file".into());
    }
    let mut content = String::new();
    file.take(MAX_BYTES as u64 + 1)
        .read_to_string(&mut content)
        .map_err(skill_io)?;
    if content.len() > MAX_BYTES {
        return Err("Skill content exceeds 1 MiB".into());
    }
    if !bundle {
        parse_frontmatter(&content)?;
    }
    Ok(content)
}

fn parse_frontmatter(content: &str) -> Result<Frontmatter, String> {
    let rest = content
        .strip_prefix("---\n")
        .or_else(|| content.strip_prefix("---\r\n"))
        .ok_or("Skill requires YAML frontmatter")?;
    let mut end = 0;
    for line in rest.split_inclusive('\n') {
        if line.trim_end_matches(['\r', '\n']) == "---" {
            return serde_yaml_ng::from_str(&rest[..end])
                .map_err(|error| format!("Invalid skill frontmatter: {error}"));
        }
        end += line.len();
    }
    Err("Skill frontmatter has no closing delimiter".into())
}

fn checked_root(root: &Path, create: bool) -> io::Result<PathBuf> {
    let home = root.parent().expect("skill root has a parent");
    let anchor = home.parent().unwrap_or(home);
    if create {
        fs::create_dir_all(anchor)?;
    }
    let home = anchor
        .canonicalize()?
        .join(home.file_name().unwrap_or_default());
    ensure_real_directory(&home, create)?;
    let root = home.join("skills");
    ensure_real_directory(&root, create)?;
    Ok(root)
}

fn ensure_real_directory(path: &Path, create: bool) -> io::Result<()> {
    if create {
        match fs::create_dir(path) {
            Ok(()) => return Ok(()),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error),
        }
    }
    if !fs::symlink_metadata(path)?.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Skill directory must be a real directory",
        ));
    }
    Ok(())
}

fn skill_info(metadata: Frontmatter, source: &str, path: &Path) -> SkillInfo {
    SkillInfo {
        name: metadata.name,
        description: metadata.description,
        source: source.to_owned(),
        path: path.to_string_lossy().into_owned(),
        editable: true,
    }
}

fn skill_io(error: io::Error) -> String {
    format!("Skill filesystem error: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    fn roots(temp: &tempfile::TempDir) -> SkillRoots {
        let workspace = temp.path().join("workspace");
        fs::create_dir(&workspace).unwrap();
        SkillRoots {
            user: temp.path().join(".dsh/skills"),
            workspace: Some(workspace),
        }
    }

    #[test]
    fn saves_reads_lists_updates_and_deletes_both_scopes() {
        let temp = tempfile::tempdir().unwrap();
        let roots = roots(&temp);

        for (scope, source) in [("user", "user-dsh"), ("workspace", "project-dsh")] {
            let description = "A: quoted \"value\"\nwith a second line";
            let saved = roots
                .save("demo", description, "Instructions", scope)
                .unwrap();
            let path = PathBuf::from(&saved.path);
            assert_eq!(saved.description, description);
            assert_eq!(saved.source, source);
            assert!(saved.editable);
            assert!(read(&path).unwrap().ends_with("\n\nInstructions"));
            assert_eq!(roots.merge(Vec::new()), vec![saved.clone()]);

            let original =
                "---\r\nname: demo\r\ndescription: >\r\n  Edited text\r\n---\r\nNew body";
            let edited = roots.save("demo", "unused", original, scope).unwrap();
            assert_eq!(read(&path).unwrap(), original);
            assert_eq!(edited.description.trim_end(), "Edited text");
            assert_eq!(roots.merge(vec![saved]), vec![edited.clone()]);

            fs::write(path.with_file_name("resource.txt"), "resource").unwrap();
            roots.delete(&path).unwrap();
            assert!(!path.parent().unwrap().exists());
            assert!(roots.merge(vec![edited]).is_empty());
        }
    }

    #[test]
    fn rejects_traversal_and_symlinked_bundles() {
        let temp = tempfile::tempdir().unwrap();
        let roots = roots(&temp);
        for name in [
            "",
            ".",
            "..",
            "../outside",
            "nested/name",
            "/absolute",
            "back\\slash",
        ] {
            assert!(roots.save(name, "description", "body", "user").is_err());
        }

        let outside = temp.path().join("outside");
        fs::create_dir(&outside).unwrap();
        let file = outside.join(SKILL_FILE);
        fs::write(&file, "untouched").unwrap();
        let root = checked_root(&roots.user, true).unwrap();
        symlink(&outside, root.join("escape")).unwrap();
        assert!(roots.save("escape", "description", "body", "user").is_err());
        assert!(roots.delete(&root.join("escape/SKILL.md")).is_err());
        assert!(roots.delete(&root.join("../../outside/SKILL.md")).is_err());
        assert!(roots.delete(&file).is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), "untouched");

        let saved = roots.save("real", "description", "body", "user").unwrap();
        symlink(root.join("real"), root.join("alias")).unwrap();
        assert!(roots.delete(&root.join("alias/SKILL.md")).is_err());
        assert!(Path::new(&saved.path).is_file());
    }

    #[test]
    fn rejects_other_files_symlinks_and_oversized_content() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join(SKILL_FILE);
        fs::write(&file, vec![b'x'; MAX_BYTES]).unwrap();
        assert_eq!(read(&file).unwrap().len(), MAX_BYTES);
        fs::write(&file, vec![b'x'; MAX_BYTES + 1]).unwrap();
        assert!(read(&file).is_err());

        let other = temp.path().join("other.md");
        fs::rename(&file, &other).unwrap();
        assert!(read(&other).is_err());
        symlink(&other, &file).unwrap();
        assert!(read(&file).is_err());
    }
}
