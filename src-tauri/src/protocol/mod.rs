pub mod jsonrpc;
pub mod sdk_adapter;

use crate::domain::{
    ApprovalRequestEvent, BridgeCapabilities, HostRuntimeInfo, SessionRunStatus,
    SessionTelemetryEvent, StreamDeltaEvent, SubagentEvent, UiSessionEvent,
    UserQuestionCancelledEvent, UserQuestionRequestEvent, WorkerStatus,
};

#[derive(Debug, Clone, PartialEq)]
pub enum BackendEvent {
    WorkerStatus(WorkerStatus),
    BridgeCapabilities(BridgeCapabilities),
    HostInfo(Option<HostRuntimeInfo>),
    StreamDelta(StreamDeltaEvent),
    SessionStatus {
        session_id: String,
        status: SessionRunStatus,
    },
    SessionEvent(UiSessionEvent),
    SessionTelemetry(SessionTelemetryEvent),
    ApprovalRequest(ApprovalRequestEvent),
    UserQuestion(UserQuestionRequestEvent),
    UserQuestionCancelled(UserQuestionCancelledEvent),
    Subagent(SubagentEvent),
}

impl crate::domain::SessionTelemetry {
    pub(crate) fn add_usage(&mut self, usage: &serde_json::Value) {
        let tokens = |snake: &str, camel: &str| {
            usage[snake]
                .as_u64()
                .or_else(|| usage[camel].as_u64())
                .unwrap_or_default()
        };
        self.uncached_input_tokens = self
            .uncached_input_tokens
            .saturating_add(tokens("input_tokens", "uncachedInputTokens"));
        self.cache_read_tokens = self
            .cache_read_tokens
            .saturating_add(tokens("cache_read_input_tokens", "cacheReadTokens"));
        self.cache_write_tokens = self
            .cache_write_tokens
            .saturating_add(tokens("cache_creation_input_tokens", "cacheWriteTokens"));
        self.output_tokens = self
            .output_tokens
            .saturating_add(tokens("output_tokens", "outputTokens"));
    }
}
