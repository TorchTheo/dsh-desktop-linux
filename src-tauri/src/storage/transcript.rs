use std::{
    collections::HashSet,
    fs::{self, File},
    io::{self, BufRead},
    path::{Path, PathBuf},
};

use serde_json::Value;

use crate::{
    domain::{assistant_usage, SessionTelemetry, SubagentNode, UiSessionDetail},
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

const MAX_SUBAGENT_DEPTH: usize = 8;

fn collect_subagent(
    children: &mut Vec<SubagentNode>,
    seen: &mut HashSet<String>,
    parent_session_id: &str,
    data: &Value,
) {
    let Some(child_id) = data["childId"]
        .as_str()
        .filter(|id| session_id_component(id))
    else {
        return;
    };
    if !seen.insert(child_id.to_owned()) {
        return;
    }
    children.push(SubagentNode {
        session_id: child_id.into(),
        parent_session_id: parent_session_id.into(),
        name: data["name"].as_str().map(str::to_owned),
        label: data["label"].as_str().map(str::to_owned),
        mode: data["mode"].as_str().map(str::to_owned),
        provider: data["agentProvider"]
            .as_str()
            .or_else(|| data["provider"].as_str())
            .map(str::to_owned),
        model: data["agentModel"]
            .as_str()
            .or_else(|| data["model"].as_str())
            .map(str::to_owned),
        created_at: data["childCreatedAt"].as_u64().unwrap_or_default(),
        status: "unknown".into(),
        stop_reason: None,
        children: Vec::new(),
    });
}

fn load_subagent_tree(
    dsh_home: &Path,
    children: &mut Vec<SubagentNode>,
    visited: &mut HashSet<String>,
    depth: usize,
) {
    children.retain_mut(|child| {
        if !visited.insert(child.session_id.clone()) {
            return false;
        }
        load_subagent(dsh_home, child, visited, depth);
        true
    });
}

fn load_subagent(
    dsh_home: &Path,
    child: &mut SubagentNode,
    visited: &mut HashSet<String>,
    depth: usize,
) {
    let Some(path) = find_session_log_path(dsh_home, &child.session_id) else {
        return;
    };
    let Ok(lines) = read_log(&path) else {
        return;
    };
    let mut turn_open = false;
    let mut seen = HashSet::new();
    let mut request_provider = None;
    let mut request_model = None;
    for line in lines.map_while(Result::ok) {
        let Ok(event) = serde_json::from_slice::<Value>(&line) else {
            continue;
        };
        let data = &event["data"];
        match event["type"].as_str() {
            Some("subagent/catalog") if depth < MAX_SUBAGENT_DEPTH => {
                collect_subagent(&mut child.children, &mut seen, &child.session_id, data);
            }
            Some("subagent/descriptor") => {
                update_subagent_field(&mut child.label, &data["label"]);
                update_subagent_field(&mut child.mode, &data["mode"]);
                update_subagent_field(&mut child.provider, &data["agentProvider"]);
                update_subagent_field(&mut child.model, &data["agentModel"]);
            }
            Some("request/context") => {
                update_subagent_field(&mut request_provider, &data["provider"]);
                update_subagent_field(&mut request_model, &data["model"]);
            }
            Some("turn/start") => turn_open = true,
            Some("turn/end") => {
                turn_open = false;
                let reason = &data["reason"];
                let kind = reason["kind"].as_str().unwrap_or("unknown");
                let nested_kind = reason["reason"]["kind"].as_str();
                let (status, stop_reason) = match kind {
                    "aborted" => (kind, nested_kind.or(Some(kind))),
                    "error" | "failed" => (
                        "error",
                        reason["message"].as_str().or(nested_kind).or(Some(kind)),
                    ),
                    _ => (kind, None),
                };
                child.status = status.into();
                child.stop_reason = stop_reason.map(str::to_owned);
            }
            _ => {}
        }
    }
    if turn_open && path.with_file_name("session.lock").exists() {
        child.status = "running".into();
        child.stop_reason = None;
    }
    child.provider = request_provider.or(child.provider.take());
    child.model = request_model.or(child.model.take());
    load_subagent_tree(dsh_home, &mut child.children, visited, depth + 1);
}

fn update_subagent_field(field: &mut Option<String>, value: &Value) {
    if let Some(value) = value.as_str() {
        *field = Some(value.into());
    }
}

fn cached_telemetry(rows: &Value) -> (SessionTelemetry, bool) {
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
    let cache = fs::read(&cache_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .unwrap_or_default();
    let rows = &cache["record"]["rows"];
    let (telemetry, has_cached_usage) = cached_telemetry(rows);
    let mut detail = UiSessionDetail {
        session: cached
            .unwrap_or_else(|| flags.summary(session_id, &Value::Null, &Value::Null, &path)),
        messages: Vec::new(),
        provider: None,
        model: None,
        agent_preset: rows["agentPreset"]["val"].as_str().map(str::to_owned),
        telemetry,
        subagents: Vec::new(),
    };

    let cached_surface = detail.telemetry.surface_tokens;
    let has_cached_context = detail.telemetry.context_window.is_some();
    let mut transcript_usage = SessionTelemetry::default();
    let mut seen_subagents = HashSet::new();
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
            Some("session") => {
                if !has_cache {
                    detail.session.created_at = event["createdAt"].as_u64().unwrap_or_default();
                    detail.session.cwd = event["cwd"].as_str().unwrap_or_default().into();
                }
                if let Some(preset) = event["agentPreset"]
                    .as_str()
                    .or_else(|| event["meta"]["agentPreset"].as_str())
                {
                    detail.agent_preset = Some(preset.into());
                }
                None
            }
            Some("agent-preset/selected") => {
                if let Some(preset) = data["agentPreset"].as_str() {
                    detail.agent_preset = Some(preset.into());
                }
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
            Some("subagent/catalog") => {
                collect_subagent(&mut detail.subagents, &mut seen_subagents, session_id, data);
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

    let mut visited = HashSet::from([session_id.to_owned()]);
    load_subagent_tree(dsh_home, &mut detail.subagents, &mut visited, 1);
    Ok(detail)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use serde_json::json;

    use super::*;
    use crate::{domain::UiContentBlock, storage::tests::TestHome};

    #[test]
    fn loads_recursive_subagents_and_opens_child_history() {
        let home = TestHome::new();
        home.write_log(
            "parent",
            r#"{"type":"subagent/catalog","data":{"childId":"child","name":"worker","label":"Catalog label","mode":"fork","childCreatedAt":10}}
{"type":"subagent/catalog","data":{"childId":"missing","label":"Missing child"}}
{"type":"subagent/catalog","data":{"childId":"child","name":"duplicate"}}
{"type":"subagent/catalog","data":{"childId":"live"}}"#,
        );
        home.write_log(
            "child",
            r#"{"type":"subagent/descriptor","data":{"label":"Descriptor label","agentProvider":"descriptor-provider","agentModel":"descriptor-model"}}
{"type":"turn/start"}
{"type":"subagent/catalog","data":{"childId":"grandchild","childCreatedAt":12}}
{"type":"request/context","data":{"model":"request-model"}}
{"type":"assistant/message","data":{"message":{"id":"child-answer","content":"Child answer"}}}
{"type":"turn/end","data":{"reason":{"kind":"completed"}}}"#,
        );
        home.write_log(
            "grandchild",
            r#"{"type":"subagent/catalog","data":{"childId":"child"}}
{"type":"turn/end","data":{"reason":{"kind":"aborted","reason":{"kind":"parent"}}}}"#,
        );
        home.write_log(
            "live",
            r#"{"type":"turn/end","data":{"reason":{"kind":"failed","message":"Earlier error"}}}
{"type":"turn/start"}"#,
        );

        let load = || load_session_transcript(&home.0, "parent").unwrap();
        let detail = load();
        let [child, missing, live] = detail.subagents.as_slice() else {
            panic!("expected three distinct children in catalog order");
        };
        assert_eq!(child.session_id, "child");
        assert_eq!(child.parent_session_id, "parent");
        assert_eq!(child.name.as_deref(), Some("worker"));
        assert_eq!(child.label.as_deref(), Some("Descriptor label"));
        assert_eq!(child.mode.as_deref(), Some("fork"));
        assert_eq!(child.provider.as_deref(), Some("descriptor-provider"));
        assert_eq!(child.model.as_deref(), Some("request-model"));
        assert_eq!(child.created_at, 10);
        assert_eq!(child.status, "completed");
        assert_eq!(child.stop_reason, None);
        let [grandchild] = child.children.as_slice() else {
            panic!("expected one grandchild");
        };
        assert_eq!(grandchild.session_id, "grandchild");
        assert_eq!(grandchild.parent_session_id, "child");
        assert_eq!(grandchild.status, "aborted");
        assert_eq!(grandchild.stop_reason.as_deref(), Some("parent"));
        assert!(grandchild.children.is_empty());
        assert_eq!(missing.session_id, "missing");
        assert_eq!(missing.status, "unknown");
        assert_eq!(live.status, "error");
        assert_eq!(live.stop_reason.as_deref(), Some("Earlier error"));

        home.write("sessions/project/live/session.lock", b"");
        let detail = load();
        assert_eq!(detail.subagents[2].status, "running");
        assert_eq!(detail.subagents[2].stop_reason, None);

        let child_detail = load_session_transcript(&home.0, &child.session_id).unwrap();
        assert_eq!(child_detail.messages[0].id, "child-answer");
        assert_eq!(child_detail.subagents, child.children);
    }

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
    fn loads_agent_preset_from_cache_header_and_selection() {
        let home = TestHome::new();
        let session_id = "presets";
        let header = r#"{"type":"session","cwd":"/work","createdAt":10,"agentPreset":"standard","meta":{"agentPreset":"legacy"}}"#;
        let selected = r#"{"type":"agent-preset/selected","data":{"agentPreset":"redteam"}}"#;
        let assert_preset = |log: &str, expected| {
            home.write_log(session_id, log);
            let detail = load_session_transcript(&home.0, session_id).unwrap();
            assert_eq!(detail.agent_preset.as_deref(), expected);
        };

        assert_preset(header, Some("standard"));
        assert_preset(&format!("{header}\n{selected}"), Some("redteam"));

        home.write(
            "storages/session_projcache/sessions/presets.json",
            br#"{"record":{"rows":{"agentPreset":{"val":"cached"}}}}"#,
        );
        assert_preset(r#"{"type":"session"}"#, Some("cached"));
        assert_preset(
            r#"{"type":"session","meta":{"agentPreset":"legacy"}}"#,
            Some("legacy"),
        );
        assert_preset(header, Some("standard"));
        assert_preset(&format!("{header}\n{selected}"), Some("redteam"));
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
