use std::{
    fs::File,
    io::{self, BufRead},
    path::{Path, PathBuf},
};

use serde_json::Value;

use crate::{domain::UiSessionDetail, protocol::sdk_adapter::decode_message};

use super::{
    session_id_component,
    workspace::{cache_directory, directory_entries, SessionFlags},
};

pub(super) fn session_log_path(session_dir: &Path) -> PathBuf {
    session_dir.join("session.v4.jsonl.zstd")
}

pub fn find_session_log_path(dsh_home: &Path, session_id: &str) -> Option<PathBuf> {
    if !session_id_component(session_id) {
        return None;
    }
    directory_entries(&dsh_home.join("sessions"))
        .map(|project| session_log_path(&project.path().join(session_id)))
        .filter(|path| path.is_file())
        .min()
}

pub(super) fn read_log(path: &Path) -> io::Result<impl Iterator<Item = io::Result<Vec<u8>>>> {
    let decoder = zstd::stream::Decoder::new(File::open(path)?)?;
    Ok(io::BufReader::new(decoder).split(b'\n'))
}

pub fn load_session_transcript(
    dsh_home: &Path,
    session_id: &str,
) -> Result<UiSessionDetail, String> {
    let path = find_session_log_path(dsh_home, session_id)
        .ok_or_else(|| format!("Session log not found for {session_id}"))?;
    let read_error = |error| format!("Could not read session log {}: {error}", path.display());
    let lines = read_log(&path).map_err(read_error)?;
    let flags = SessionFlags::load(dsh_home);
    let cache_path = cache_directory(dsh_home).join(format!("{session_id}.json"));
    let cached = flags.cached_summary(session_id, &cache_path);
    let has_cache = cached.is_some();
    let mut detail = UiSessionDetail {
        session: cached
            .unwrap_or_else(|| flags.summary(session_id, &Value::Null, &Value::Null, &path)),
        messages: Vec::new(),
        provider: None,
        model: None,
    };

    for (line_index, line) in lines.enumerate() {
        let line = line.map_err(read_error)?;
        let Ok(event) = serde_json::from_slice::<Value>(&line) else {
            continue;
        };
        let data = &event["data"];
        let role = match event["type"].as_str() {
            Some("user/message")
                if data.get("source").is_none() || data["source"]["kind"] == "user" =>
            {
                Some("user")
            }
            Some("assistant/message") => Some("assistant"),
            Some("tool/result") => Some("tool"),
            Some("session") if !has_cache => {
                detail.session.created_at = event["createdAt"].as_u64().unwrap_or_default();
                detail.session.cwd = event["cwd"].as_str().unwrap_or_default().into();
                None
            }
            Some("session/title") => {
                if let Some(title) = data["title"].as_str() {
                    detail.session.title = title.into();
                }
                None
            }
            Some("request/context") => {
                detail.provider = data["provider"].as_str().map(str::to_owned);
                detail.model = data["model"].as_str().map(str::to_owned);
                None
            }
            _ => None,
        };
        if let Some(message) = role
            .and_then(|role| decode_message(session_id, &event, data, role, Some(line_index + 1)))
        {
            detail.messages.push(message);
        }
    }

    Ok(detail)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use serde_json::json;

    use super::*;
    use crate::{domain::UiContentBlock, storage::tests::TestHome};

    #[test]
    fn replays_messages_and_metadata_from_a_compressed_log() {
        let home = TestHome::new();
        let log = home.write_log(
            "history",
            r#"{"type":"session","cwd":"/work","createdAt":10}
{"type":"request/context","data":{"provider":"first","model":"old"}}
{"type":"user/message","time":11,"data":{"id":"u1","source":{"kind":"user"},"content":[{"type":"text","text":"Hello"}]}}
{"type":"user/message","data":{"source":{"kind":"context"},"content":"injected context"}}
{"type":"user/message","data":{"source":null,"content":"invalid source"}}
{"type":"user/message","data":{"content":"Legacy format"}}

invalid JSON
{"type":"future/event","data":{"content":"ignore"}}
{"type":"assistant/message","time":12,"data":{"message":{"id":"a1","content":[{"type":"thinking","thinking":"Plan"},{"type":"text","text":"Answer"},{"type":"tool_use","id":"call","name":"read","input":{"path":"file"}},{"type":"tool_result","tool_use_id":"call","content":"ok"}]}}}
{"type":"tool/result","time":13,"data":{"message":{"id":"t1","toolCallId":"call","content":{"output":"denied"},"isError":true}}}
{"type":"session/title","data":{"title":"Draft"}}
{"type":"request/context","data":{"provider":"last","model":"current"}}
{"type":"session/title","data":{"title":"Final title"}}"#,
        );
        let lock = home.write("sessions/project/history/session.lock", b"existing lock");

        assert_eq!(find_session_log_path(&home.0, "history"), Some(log));
        let detail = load_session_transcript(&home.0, "history").unwrap();
        assert_eq!(detail.session.title, "Final title");
        assert_eq!(detail.session.cwd, "/work");
        assert_eq!(detail.session.created_at, 10);
        assert!(detail.session.persisted);
        assert_eq!(detail.provider.as_deref(), Some("last"));
        assert_eq!(detail.model.as_deref(), Some("current"));
        let [user, legacy, assistant, tool] = detail.messages.as_slice() else {
            panic!("expected four replayed messages, got {:?}", detail.messages);
        };
        assert_eq!((&*user.id, &*user.role, user.timestamp), ("u1", "user", 11));
        assert_eq!(
            user.blocks,
            vec![UiContentBlock::Text {
                text: "Hello".into()
            }]
        );
        assert_eq!(
            legacy.blocks,
            vec![UiContentBlock::Text {
                text: "Legacy format".into()
            }]
        );
        assert_eq!(legacy.role, "user");
        assert_ne!(legacy.id, user.id);
        assert_eq!((&*assistant.id, &*assistant.role), ("a1", "assistant"));
        assert_eq!(
            assistant.blocks,
            vec![
                UiContentBlock::Thinking {
                    thinking: "Plan".into()
                },
                UiContentBlock::Text {
                    text: "Answer".into()
                },
                UiContentBlock::ToolUse {
                    id: "call".into(),
                    name: "read".into(),
                    input: json!({"path":"file"})
                },
                UiContentBlock::ToolResult {
                    tool_use_id: "call".into(),
                    content: json!("ok"),
                    is_error: false
                },
            ]
        );
        assert_eq!((&*tool.id, &*tool.role, tool.timestamp), ("t1", "tool", 13));
        assert!(tool.is_error);
        assert_eq!(
            tool.blocks,
            vec![UiContentBlock::ToolResult {
                tool_use_id: "call".into(),
                content: json!({"output":"denied"}),
                is_error: true,
            }]
        );
        assert_eq!(fs::read(lock).unwrap(), b"existing lock");
    }

    #[test]
    fn reports_missing_or_unreadable_logs() {
        let home = TestHome::new();
        assert!(find_session_log_path(&home.0, "../history").is_none());
        assert!(load_session_transcript(&home.0, "missing")
            .unwrap_err()
            .contains("not found"));
        home.write(
            "sessions/project/corrupt/session.v4.jsonl.zstd",
            b"invalid zstd",
        );
        assert!(load_session_transcript(&home.0, "corrupt")
            .unwrap_err()
            .contains("Could not read"));
    }
}
