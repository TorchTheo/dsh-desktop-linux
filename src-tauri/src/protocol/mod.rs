pub mod jsonrpc;
pub mod sdk_adapter;

use crate::domain::{
    ApprovalRequestEvent, BridgeCapabilities, HostRuntimeInfo, SessionJobsEvent, SessionRunStatus,
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
    SessionJobs(SessionJobsEvent),
    ApprovalRequest(ApprovalRequestEvent),
    UserQuestion(UserQuestionRequestEvent),
    UserQuestionCancelled(UserQuestionCancelledEvent),
    Subagent(SubagentEvent),
}
