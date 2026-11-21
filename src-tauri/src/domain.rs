use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::config::AppConfig;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum WorkerStatus {
    Idle,
    Starting,
    Ready {
        server_name: String,
        server_version: String,
    },
    Error {
        message: String,
    },
    Stopped,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionRunStatus {
    Idle,
    Running,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub session_id: String,
    pub title: String,
    pub cwd: String,
    pub status: SessionRunStatus,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub persisted: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummary {
    pub id: String,
    pub title: String,
    pub path: String,
    pub session_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStateSnapshot {
    pub config: AppConfig,
    pub worker_status: WorkerStatus,
    #[serde(default)]
    pub bridge_capabilities: BridgeCapabilities,
    pub sessions: Vec<SessionSummary>,
    #[serde(default)]
    pub workspaces: Vec<WorkspaceSummary>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeCapabilities {
    pub stream_delta: bool,
    pub abort: bool,
    pub model_control: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamDeltaEvent {
    pub session_id: String,
    pub block_type: String,
    pub delta: String,
    #[serde(default)]
    pub reset: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelEntry {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModels {
    pub id: String,
    pub name: String,
    pub models: Vec<ModelEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionModelSelection {
    pub provider: String,
    pub model: String,
    pub reasoning_effort: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageAttachment {
    pub data: String,
    pub mime_type: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum UiContentBlock {
    Text {
        text: String,
    },
    Thinking {
        thinking: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    ToolResult {
        tool_use_id: String,
        content: Value,
        is_error: bool,
    },
    Image {
        mime_type: String,
        data_url: String,
    },
    Unknown {
        raw: Value,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiMessage {
    pub id: String,
    pub role: String,
    pub blocks: Vec<UiContentBlock>,
    pub timestamp: u64,
    pub is_error: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTelemetry {
    pub uncached_input_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub output_tokens: u64,
    pub context_window: Option<u64>,
    pub surface_tokens: Option<u64>,
    pub system_tokens: Option<u64>,
    pub tools_tokens: Option<u64>,
    pub message_tokens: Option<u64>,
    pub sandbox_mode: Option<String>,
    pub approval_policy: Option<String>,
    pub turn_count: u64,
    pub snapshot_count: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTelemetryEvent {
    pub session_id: String,
    pub telemetry: SessionTelemetry,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RewindResult {
    pub session: SessionSummary,
    pub workspace_restored: bool,
    pub workspace_note: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSessionDetail {
    pub session: SessionSummary,
    pub messages: Vec<UiMessage>,
    pub provider: Option<String>,
    pub model: Option<String>,
    #[serde(default)]
    pub telemetry: SessionTelemetry,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum UiSessionEvent {
    Message {
        session_id: String,
        message: UiMessage,
    },
    TitleUpdated {
        session_id: String,
        title: String,
    },
    AttemptFailed {
        session_id: String,
        message: String,
    },
    TurnStarted {
        session_id: String,
    },
    TurnEnded {
        session_id: String,
        reason: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRequestEvent {
    pub request_id: String,
    pub session_id: String,
    pub tool_name: String,
    pub call_id: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ApprovalOutcome {
    AllowedOnce,
    Rejected,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserQuestionRequestEvent {
    pub request_id: String,
    pub session_id: String,
    pub questions: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserQuestionCancelledEvent {
    pub request_id: String,
    pub session_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentEvent {
    pub kind: String,
    pub parent_session_id: String,
    pub child_session_id: String,
    pub status: Option<String>,
    pub stop_reason: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, to_value};

    #[test]
    fn existing_snapshots_default_new_storage_fields() {
        let snapshot: AppStateSnapshot = serde_json::from_value(json!({
            "config": {},
            "workerStatus": {"state": "idle"},
            "sessions": [{
                "sessionId": "legacy",
                "title": "Legacy",
                "cwd": "/work",
                "status": "idle",
                "createdAt": 1,
                "updatedAt": 2
            }]
        }))
        .unwrap();
        assert!(snapshot.workspaces.is_empty());
        assert_eq!(snapshot.bridge_capabilities, BridgeCapabilities::default());
        let session = &snapshot.sessions[0];
        assert!(!session.pinned && !session.archived && !session.persisted);
    }

    #[test]
    fn worker_status_uses_state_and_camel_case_fields() {
        let status = WorkerStatus::Ready {
            server_name: "dsh".into(),
            server_version: "1.0".into(),
        };
        assert_eq!(
            to_value(status).unwrap(),
            json!({"state": "ready", "serverName": "dsh", "serverVersion": "1.0"})
        );
    }

    #[test]
    fn session_message_uses_tagged_events_and_blocks() {
        let event = UiSessionEvent::Message {
            session_id: "session".into(),
            message: UiMessage {
                id: "message".into(),
                role: "assistant".into(),
                blocks: vec![UiContentBlock::ToolResult {
                    tool_use_id: "call".into(),
                    content: json!({"output": "done"}),
                    is_error: false,
                }],
                timestamp: 42,
                is_error: false,
            },
        };
        let encoded = to_value(&event).unwrap();
        assert_eq!(
            encoded,
            json!({
                "kind": "message",
                "sessionId": "session",
                "message": {
                    "id": "message", "role": "assistant", "timestamp": 42, "isError": false,
                    "blocks": [{
                        "type": "toolResult", "toolUseId": "call",
                        "content": {"output": "done"}, "isError": false
                    }]
                }
            })
        );
        assert_eq!(
            serde_json::from_value::<UiSessionEvent>(encoded).unwrap(),
            event
        );
    }

    #[test]
    fn approval_outcomes_use_kebab_case() {
        for (outcome, expected) in [
            (ApprovalOutcome::AllowedOnce, "allowed-once"),
            (ApprovalOutcome::Rejected, "rejected"),
            (ApprovalOutcome::Cancelled, "cancelled"),
        ] {
            assert_eq!(to_value(outcome).unwrap(), json!(expected));
        }
    }
}
