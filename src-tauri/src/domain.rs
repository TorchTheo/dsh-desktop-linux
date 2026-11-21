use std::collections::HashMap;

use serde::{Deserialize, Deserializer, Serialize};
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
    #[serde(default)]
    pub host_info: Option<HostRuntimeInfo>,
    pub sessions: Vec<SessionSummary>,
    #[serde(default)]
    pub workspaces: Vec<WorkspaceSummary>,
    #[serde(default)]
    pub pending_approvals: Vec<ApprovalRequestEvent>,
    #[serde(default)]
    pub pending_questions: Vec<UserQuestionRequestEvent>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeCapabilities {
    pub stream_delta: bool,
    pub abort: bool,
    pub model_control: bool,
    #[serde(default)]
    pub host_info: bool,
    #[serde(default)]
    pub plugin_manager: bool,
    #[serde(default)]
    pub client_plugins: bool,
    #[serde(default)]
    pub host_http_proxy: bool,
    #[serde(default)]
    pub agent_presets: bool,
    #[serde(default)]
    pub session_actions: bool,
    #[serde(default)]
    pub interrupt_and_send: bool,
    #[serde(default)]
    pub session_jobs: bool,
    #[serde(default)]
    pub skills_manager: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub source: String,
    pub path: String,
    pub editable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPresetInfo {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPresetCatalog {
    pub default_preset_id: Option<String>,
    pub presets: Vec<AgentPresetInfo>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPresetResult {
    pub session_id: String,
    pub preset_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostRuntimeInfo {
    pub web_origin: Option<String>,
    pub authenticated_url: Option<String>,
    pub profile: Option<String>,
    pub has_web_server: bool,
    pub has_plugin_manager: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientPluginModule {
    pub id: String,
    pub package_name: String,
    pub bundle_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxiedHttpResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body_base64: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginEntryInfo {
    pub row_id: String,
    pub module_name: String,
    pub entry_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginBundleInfo {
    pub name: String,
    pub enabled: bool,
    pub installed: bool,
    pub removable: bool,
    pub availability: String,
    #[serde(default, deserialize_with = "deserialize_optional_string_or_value")]
    pub description: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string_or_value")]
    pub version: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string_or_value")]
    pub source: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string_or_value")]
    pub error: Option<String>,
    pub entries: Vec<PluginEntryInfo>,
}

fn deserialize_optional_string_or_value<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    Ok(
        Option::<Value>::deserialize(deserializer)?.map(|value| match value {
            Value::String(text) => text,
            other => other.to_string(),
        }),
    )
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPermission {
    pub sandbox_mode: String,
    pub approval_policy: String,
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
    Deliverable {
        path: String,
        description: Option<String>,
        mime_type: Option<String>,
    },
    Unknown {
        raw: Value,
    },
}

pub fn infer_mime_type(path: &str) -> Option<String> {
    let extension = std::path::Path::new(path).extension()?.to_str()?;
    let mime = match extension.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "pdf" => "application/pdf",
        "html" => "text/html",
        "md" => "text/markdown",
        "txt" => "text/plain",
        "json" => "application/json",
        _ => return None,
    };
    Some(mime.to_owned())
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

impl SessionTelemetry {
    pub(crate) fn add_usage(&mut self, usage: &serde_json::Value) {
        let tokens = |snake: &str, camel: &str| {
            usage[snake]
                .as_u64()
                .or_else(|| usage[camel].as_u64())
                .unwrap_or_default()
        };
        let uncached = usage["uncachedInputTokens"]
            .as_u64()
            .or_else(|| usage["inputTokens"].as_u64())
            .or_else(|| usage["input_tokens"].as_u64())
            .unwrap_or_default();
        let cache_read = tokens("cache_read_input_tokens", "cacheReadTokens");
        let cache_write = tokens("cache_creation_input_tokens", "cacheWriteTokens");
        let output = tokens("output_tokens", "outputTokens");

        self.uncached_input_tokens = self.uncached_input_tokens.saturating_add(uncached);
        self.cache_read_tokens = self.cache_read_tokens.saturating_add(cache_read);
        self.cache_write_tokens = self.cache_write_tokens.saturating_add(cache_write);
        self.output_tokens = self.output_tokens.saturating_add(output);

        let surface = uncached
            .saturating_add(cache_read)
            .saturating_add(cache_write);
        let surface = if surface == 0 {
            usage["totalTokens"]
                .as_u64()
                .unwrap_or_default()
                .saturating_sub(output)
        } else {
            surface
        };
        if surface > 0 {
            self.surface_tokens = Some(surface);
        }
    }
}

pub(crate) fn assistant_usage(data: &serde_json::Value) -> Option<&serde_json::Value> {
    [&data["usage"], &data["message"]["usage"]]
        .into_iter()
        .find(|usage| usage.is_object())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundJobInfo {
    pub job_id: String,
    pub kind: String,
    pub label: String,
    pub status: String,
    pub started_at: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionJobsEvent {
    pub session_id: String,
    pub jobs: Vec<BackgroundJobInfo>,
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
    fn plugin_bundle_accepts_non_string_metadata() {
        let bundle: PluginBundleInfo = serde_json::from_value(json!({
            "name": "example",
            "enabled": false,
            "installed": true,
            "removable": true,
            "availability": "unavailable",
            "description": null,
            "version": 1,
            "error": {"code": "unsupported-platform"},
            "source": {"kind": "file", "spec": "..."},
            "entries": []
        }))
        .unwrap();

        assert_eq!(
            bundle.error.as_deref(),
            Some(r#"{"code":"unsupported-platform"}"#)
        );
        assert_eq!(
            bundle.source.as_deref(),
            Some(r#"{"kind":"file","spec":"..."}"#)
        );
        assert_eq!(bundle.description, None);
        assert_eq!(bundle.version.as_deref(), Some("1"));
    }

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
        assert!(snapshot.pending_approvals.is_empty());
        assert!(snapshot.pending_questions.is_empty());
        assert!(snapshot.host_info.is_none());
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
