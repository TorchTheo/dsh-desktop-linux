pub mod jsonrpc;
pub mod sdk_adapter;

use crate::domain::{
    ApprovalRequestEvent, BridgeCapabilities, SessionRunStatus, StreamDeltaEvent, SubagentEvent,
    UiSessionEvent, UserQuestionCancelledEvent, UserQuestionRequestEvent, WorkerStatus,
};

#[derive(Debug, Clone, PartialEq)]
pub enum BackendEvent {
    WorkerStatus(WorkerStatus),
    BridgeCapabilities(BridgeCapabilities),
    StreamDelta(StreamDeltaEvent),
    SessionStatus {
        session_id: String,
        status: SessionRunStatus,
    },
    SessionEvent(UiSessionEvent),
    ApprovalRequest(ApprovalRequestEvent),
    UserQuestion(UserQuestionRequestEvent),
    UserQuestionCancelled(UserQuestionCancelledEvent),
    Subagent(SubagentEvent),
}
