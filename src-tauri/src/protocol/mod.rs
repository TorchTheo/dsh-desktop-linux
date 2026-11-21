pub mod jsonrpc;
pub mod sdk_adapter;

use crate::domain::{
    ApprovalRequestEvent, SessionRunStatus, SubagentEvent, UiSessionEvent,
    UserQuestionCancelledEvent, UserQuestionRequestEvent, WorkerStatus,
};

#[derive(Debug, Clone, PartialEq)]
pub enum BackendEvent {
    WorkerStatus(WorkerStatus),
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
