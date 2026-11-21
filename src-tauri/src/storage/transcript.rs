use std::{
    fs::{self, File},
    io::{self, BufRead},
    path::{Path, PathBuf},
};

use serde_json::Value;

use crate::{
    domain::{assistant_usage, SessionTelemetry, UiSessionDetail},
    protocol::sdk_adapter::decode_message,
};

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

fn cached_telemetry(cache_path: &Path) -> (SessionTelemetry, bool) {
    let cache = fs::read(cache_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .unwrap_or_default();
    let rows = &cache["record"]["rows"];
    let totals = &rows["tokenUsage"]["val"]["totals"];
    let pressure = &rows["contextPressure"]["val"];
    let breakdown = &rows["contextBreakdown"]["val"]["breakdown"];
    let mut telemetry = SessionTelemetry {
        context_window: pressure["contextWindow"].as_u64(),
        surface_tokens: pressure["surfaceTokens"].as_u64(),
        system_tokens: breakdown["systemTokens"].as_u64(),
        tools_tokens: breakdown["toolsTokens"].as_u64(),
        message_tokens: breakdown["messageTokens"].as_u64(),
        sandbox_mode: rows["sandboxMode"]["val"].as_str().map(str::to_owned),
        approval_policy: rows["approvalState"]["val"]["policy"]
            .as_str()
            .map(str::to_owned),
        turn_count: rows["turnBoundary"]["val"]["lastTurn"]
            .as_u64()
            .unwrap_or_default(),
        ..SessionTelemetry::default()
    };
    let cached_surface = telemetry.surface_tokens;
    telemetry.add_usage(totals);
    telemetry.surface_tokens = cached_surface;
    (telemetry, totals.is_object())
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
    let (telemetry, has_cached_usage) = cached_telemetry(&cache_path);
    let mut detail = UiSessionDetail {
        session: cached
            .unwrap_or_else(|| flags.summary(session_id, &Value::Null, &Value::Null, &path)),
        messages: Vec::new(),
        provider: None,
        model: None,
        telemetry,
    };

    let cached_surface = detail.telemetry.surface_tokens;
    let has_cached_context = detail.telemetry.context_window.is_some();
    let mut transcript_usage = SessionTelemetry::default();
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
            Some("assistant/message") => {
                if let Some(usage) = assistant_usage(data) {
                    if !has_cached_usage {
                        detail.telemetry.add_usage(usage);
                        detail.telemetry.surface_tokens =
                            cached_surface.or(detail.telemetry.surface_tokens);
                    } else if cached_surface.is_none() {
                        transcript_usage.add_usage(usage);
                        detail.telemetry.surface_tokens = transcript_usage.surface_tokens;
                    }
                }
                Some("assistant")
            }
            Some("deliverables/presented") => Some("assistant"),
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
                if let Some(window) = data["contextWindow"]
                    .as_u64()
                    .filter(|_| !has_cached_context)
                {
                    detail.telemetry.context_window = Some(window);
                }
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
    fn loads_presented_deliverables() {
        let home = TestHome::new();
        let event = json!({
            "type": "deliverables/presented",
            "time": 123,
            "data": {
                "turn": 1,
                "callId": "present-1",
                "files": [
                    {"path": "/data/ComfyUI/output/nsfw_test_00002_.png", "description": "test"}
                ]
            }
        });
        home.write_log("f6b387a3", &event.to_string());
        let detail = load_session_transcript(&home.0, "f6b387a3").unwrap();
        assert_eq!(detail.messages.len(), 1);
        let message = &detail.messages[0];
        assert_eq!(message.id, "deliverables-present-1");
        assert_eq!(message.role, "assistant");
        assert_eq!(message.timestamp, 123);
        assert!(!message.is_error);
        assert_eq!(
            message.blocks,
            vec![UiContentBlock::Deliverable {
                path: "/data/ComfyUI/output/nsfw_test_00002_.png".into(),
                description: Some("test".into()),
                mime_type: Some("image/png".into()),
            }]
        );
    }

    #[test]
    fn derives_context_and_cache_usage_from_assistant_events() {
        let home = TestHome::new();
        home.write_log(
            "f6b387a3",
            r#"{"type":"request/context","data":{"contextWindow":300000}}
{"type":"assistant/message","data":{"message":{"usage":{"inputTokens":1702,"outputTokens":290,"totalTokens":110792,"cacheReadTokens":108800}}}}"#,
        );
        let telemetry = load_session_transcript(&home.0, "f6b387a3")
            .unwrap()
            .telemetry;
        assert_eq!(telemetry.uncached_input_tokens, 1702);
        assert_eq!(telemetry.cache_read_tokens, 108800);
        assert_eq!(telemetry.surface_tokens, Some(110502));
        assert_eq!(telemetry.context_window, Some(300000));

        home.write(
            "storages/session_projcache/sessions/f6b387a3.json",
            br#"{"record":{"rows":{"tokenUsage":{"val":{"totals":{"uncachedInputTokens":1702,"cacheReadTokens":108800}}}}}}"#,
        );
        let telemetry = load_session_transcript(&home.0, "f6b387a3")
            .unwrap()
            .telemetry;
        assert_eq!(telemetry.uncached_input_tokens, 1702);
        assert_eq!(telemetry.cache_read_tokens, 108800);
        assert_eq!(telemetry.surface_tokens, Some(110502));
        assert_eq!(telemetry.context_window, Some(300000));
    }

    #[test]
    fn prefers_projcache_usage_and_falls_back_to_assistant_usage() {
        let home = TestHome::new();
        home.write_log(
            "telemetry",
            r#"{"type":"assistant/message","data":{"usage":{"input_tokens":20,"cache_read_input_tokens":30,"cache_creation_input_tokens":40,"output_tokens":50}}}
{"type":"assistant/message","data":{"usage":{"uncachedInputTokens":2,"cacheReadTokens":3,"cacheWriteTokens":4,"outputTokens":5}}}
{"type":"user/message","data":{"usage":{"output_tokens":99}}}"#,
        );
        let cache = "storages/session_projcache/sessions/telemetry.json";
        let mut rows = json!({
            "tokenUsage": {"val": {"totals": {
                "uncachedInputTokens": 1, "cacheReadTokens": 2, "cacheWriteTokens": 3, "outputTokens": 4
            }}},
            "contextPressure": {"val": {"surfaceTokens": 5, "contextWindow": 6}},
            "contextBreakdown": {"val": {"breakdown": {"systemTokens": 7, "toolsTokens": 8, "messageTokens": 9}}},
            "sandboxMode": {"val": "workspace-write"},
            "approvalState": {"val": {"policy": "on-request"}},
            "turnBoundary": {"val": {"lastTurn": 10}}
        });
        home.write(
            cache,
            &serde_json::to_vec(&json!({"record":{"rows":rows}})).unwrap(),
        );
        let expected = SessionTelemetry {
            uncached_input_tokens: 1,
            cache_read_tokens: 2,
            cache_write_tokens: 3,
            output_tokens: 4,
            surface_tokens: Some(5),
            context_window: Some(6),
            system_tokens: Some(7),
            tools_tokens: Some(8),
            message_tokens: Some(9),
            sandbox_mode: Some("workspace-write".into()),
            approval_policy: Some("on-request".into()),
            turn_count: 10,
            ..Default::default()
        };
        assert_eq!(
            load_session_transcript(&home.0, "telemetry")
                .unwrap()
                .telemetry,
            expected
        );

        rows.as_object_mut().unwrap().remove("tokenUsage");
        home.write(
            cache,
            &serde_json::to_vec(&json!({"record":{"rows":rows}})).unwrap(),
        );
        assert_eq!(
            load_session_transcript(&home.0, "telemetry")
                .unwrap()
                .telemetry,
            SessionTelemetry {
                uncached_input_tokens: 22,
                cache_read_tokens: 33,
                cache_write_tokens: 44,
                output_tokens: 55,
                ..expected
            }
        );
    }

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
