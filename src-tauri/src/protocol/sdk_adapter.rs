use std::{
    collections::HashMap,
    env, fs, io,
    path::Path,
    process::Stdio,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use directories::BaseDirs;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::{Child, Command},
    sync::{mpsc, Mutex as AsyncMutex},
    task::JoinHandle,
    time::{sleep, timeout},
};
use uuid::Uuid;

use crate::{
    config::AppConfig,
    domain::{
        ApprovalOutcome, ApprovalRequestEvent, BridgeCapabilities, HostRuntimeInfo,
        ImageAttachment, PluginBundleInfo, ProviderModels, SessionModelSelection,
        SessionPermission, SessionRunStatus, SessionTelemetry, SessionTelemetryEvent,
        StreamDeltaEvent, SubagentEvent, UiContentBlock, UiMessage, UiSessionEvent,
        UserQuestionCancelledEvent, UserQuestionRequestEvent, WorkerStatus,
    },
};

use super::{
    jsonrpc::{IncomingMessage, JsonRpcTransport},
    BackendEvent,
};

const RPC_TIMEOUT: Duration = Duration::from_secs(20);
type RequestKey = (RequestKind, String);
type RequestError = (i64, &'static str);
type ServerRequests = Arc<Mutex<HashMap<RequestKey, Value>>>;

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum RequestKind {
    Approval,
    Question,
}

pub struct SdkAdapter {
    ready_status: WorkerStatus,
    capabilities: BridgeCapabilities,
    transport: Arc<JsonRpcTransport>,
    process: AsyncMutex<ProcessGroup>,
    pending: ServerRequests,
    event_tx: mpsc::UnboundedSender<BackendEvent>,
    stopping: Arc<AtomicBool>,
    dispatch: Option<JoinHandle<()>>,
    stderr: JoinHandle<()>,
}

impl SdkAdapter {
    pub async fn start(
        config: &AppConfig,
        event_tx: mpsc::UnboundedSender<BackendEvent>,
    ) -> Result<Self, String> {
        let _ = event_tx.send(BackendEvent::WorkerStatus(WorkerStatus::Starting));
        let result = Self::launch(config, event_tx.clone()).await;
        if let Err(message) = &result {
            let _ = event_tx.send(BackendEvent::WorkerStatus(WorkerStatus::Error {
                message: message.clone(),
            }));
        }
        result
    }

    async fn launch(
        config: &AppConfig,
        event_tx: mpsc::UnboundedSender<BackendEvent>,
    ) -> Result<Self, String> {
        let mut process = ProcessGroup::spawn(config)?;
        let stdin = process.child.stdin.take().expect("piped stdin");
        let stdout = process.child.stdout.take().expect("piped stdout");
        let stderr = process.child.stderr.take().expect("piped stderr");
        let stderr = tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).split(b'\n');
            while let Ok(Some(line)) = lines.next_segment().await {
                tracing::debug!(target: "dsh_sdk", "{}", String::from_utf8_lossy(&line));
            }
        });

        let (incoming_tx, incoming_rx) = mpsc::unbounded_channel();
        let mut adapter = Self {
            ready_status: WorkerStatus::Starting,
            capabilities: BridgeCapabilities::default(),
            transport: Arc::new(JsonRpcTransport::new(stdout, stdin, incoming_tx)),
            process: AsyncMutex::new(process),
            pending: ServerRequests::default(),
            event_tx,
            stopping: Arc::new(AtomicBool::new(false)),
            dispatch: None,
            stderr,
        };

        let mut params = json!({
            "cwd": config.default_cwd,
            "provider": config.provider,
            "model": config.model,
            "approvalRequests": true,
            "capabilities": {"userQuestions": true}
        });
        if let Some(effort) = &config.reasoning_effort {
            params["reasoningEffort"] = json!(effort);
        }
        let initialized = adapter.rpc("initialize", params).await.and_then(|result| {
            let info = &result["serverInfo"];
            match (info["name"].as_str(), info["version"].as_str()) {
                (Some(name), Some(version)) => Ok(WorkerStatus::Ready {
                    server_name: name.into(),
                    server_version: version.into(),
                }),
                _ => Err(
                    "initialize response is missing serverInfo.name or serverInfo.version".into(),
                ),
            }
        });
        let status = match initialized {
            Ok(status) => status,
            Err(error) => {
                adapter.transport.close_writer();
                adapter.process.get_mut().terminate().await;
                return Err(error);
            }
        };
        adapter.capabilities = match adapter.bridge_rpc("desktop/capabilities", json!({})).await {
            Ok(capabilities) => capabilities,
            Err(error) => {
                tracing::debug!(%error, "DSH desktop bridge capabilities unavailable");
                BridgeCapabilities::default()
            }
        };
        let _ = adapter
            .event_tx
            .send(BackendEvent::BridgeCapabilities(adapter.capabilities));
        if adapter.capabilities.host_info {
            match adapter.host_info().await {
                Ok(info) => {
                    let _ = adapter.event_tx.send(BackendEvent::HostInfo(Some(info)));
                }
                Err(_) => tracing::debug!("DSH host information unavailable"),
            }
        }
        adapter.ready_status = status.clone();
        let _ = adapter.event_tx.send(BackendEvent::WorkerStatus(status));
        adapter.dispatch = Some(tokio::spawn(dispatch_messages(
            incoming_rx,
            Arc::clone(&adapter.transport),
            Arc::clone(&adapter.pending),
            adapter.event_tx.clone(),
            Arc::clone(&adapter.stopping),
        )));
        Ok(adapter)
    }

    pub(crate) fn ready_status(&self) -> &WorkerStatus {
        &self.ready_status
    }

    pub(crate) fn is_running(&self) -> bool {
        self.dispatch
            .as_ref()
            .is_some_and(|task| !task.is_finished())
    }

    async fn rpc(&self, method: &str, params: Value) -> Result<Value, String> {
        self.transport
            .request(method, Some(params), RPC_TIMEOUT)
            .await
    }

    async fn bridge_rpc<T: serde::de::DeserializeOwned>(
        &self,
        method: &str,
        params: Value,
    ) -> Result<T, String> {
        serde_json::from_value(self.rpc(method, params).await?)
            .map_err(|error| format!("Invalid {method} response: {error}"))
    }

    pub fn capabilities(&self) -> BridgeCapabilities {
        if self.is_running() {
            self.capabilities
        } else {
            BridgeCapabilities::default()
        }
    }

    pub async fn host_info(&self) -> Result<HostRuntimeInfo, String> {
        self.bridge_rpc("desktop/host/info", json!({})).await
    }

    pub async fn list_plugins(&self) -> Result<Vec<PluginBundleInfo>, String> {
        self.bridge_rpc("desktop/plugins/list", json!({})).await
    }

    pub async fn set_plugin_bundle_enabled(
        &self,
        package_name: &str,
        enabled: bool,
    ) -> Result<Value, String> {
        self.rpc(
            "desktop/plugins/set-bundle-enabled",
            json!({"packageName": package_name, "enabled": enabled}),
        )
        .await
    }

    pub async fn set_plugin_entry_enabled(
        &self,
        entry_id: &str,
        module_name: Option<&str>,
        enabled: bool,
    ) -> Result<Value, String> {
        let mut params = json!({"entryId": entry_id, "enabled": enabled});
        if let Some(module_name) = module_name {
            params["moduleName"] = json!(module_name);
        }
        self.rpc("desktop/plugins/set-entry-enabled", params).await
    }

    pub async fn install_plugin_bundle(&self, spec: &str) -> Result<Value, String> {
        self.rpc("desktop/plugins/install", json!({"spec": spec}))
            .await
    }

    pub async fn remove_plugin_bundle(&self, package_name: &str) -> Result<Value, String> {
        self.rpc(
            "desktop/plugins/remove",
            json!({"packageName": package_name}),
        )
        .await
    }

    pub async fn abort_session(&self, session_id: &str) -> Result<bool, String> {
        #[derive(Deserialize)]
        struct Response {
            aborted: bool,
        }
        let response: Response = self
            .bridge_rpc("desktop/session/abort", json!({"sessionId": session_id}))
            .await?;
        Ok(response.aborted)
    }

    pub async fn list_models(&self) -> Result<Vec<ProviderModels>, String> {
        #[derive(Deserialize)]
        struct Response {
            providers: Vec<ProviderModels>,
        }
        let response: Response = self.bridge_rpc("desktop/models/list", json!({})).await?;
        Ok(response.providers)
    }

    pub async fn set_session_model(
        &self,
        session_id: &str,
        provider: &str,
        model: &str,
        reasoning_effort: Option<&str>,
    ) -> Result<SessionModelSelection, String> {
        self.bridge_rpc(
            "desktop/session/set-model",
            json!({
                "sessionId": session_id,
                "provider": provider,
                "model": model,
                "reasoningEffort": reasoning_effort,
            }),
        )
        .await
    }

    pub async fn set_session_permission(
        &self,
        session_id: &str,
        mode: &str,
    ) -> Result<SessionPermission, String> {
        if !matches!(mode, "read-only" | "workspace-write" | "danger-full-access") {
            return Err("mode must be read-only, workspace-write, or danger-full-access".into());
        }

        self.bridge_rpc(
            "desktop/session/set-permission",
            json!({"sessionId": session_id, "mode": mode}),
        )
        .await
    }

    pub async fn send_query(
        &self,
        session_id: &str,
        text: &str,
        images: Vec<ImageAttachment>,
    ) -> Result<Option<String>, String> {
        let mut blocks = Vec::with_capacity(images.len() + 1);
        if !text.is_empty() || images.is_empty() {
            blocks.push(json!({"type": "text", "text": text}));
        }
        for image in images {
            let mut block =
                json!({"type": "image", "data": image.data, "mimeType": image.mime_type});
            if let Some(name) = image.name {
                block["name"] = json!(name);
            }
            blocks.push(block);
        }
        let result = self
            .rpc(
                "session/query",
                json!({"sessionId": session_id, "contentBlocks": blocks}),
            )
            .await?;
        Ok(result["messageId"].as_str().map(str::to_owned))
    }

    pub async fn resume_session(&self, session_id: &str) -> Result<(), String> {
        self.rpc("session/resume", json!({"sessionId": session_id}))
            .await?;
        Ok(())
    }

    pub async fn set_working_directory(
        &self,
        session_id: &str,
        path: &str,
    ) -> Result<String, String> {
        let result = self
            .rpc(
                "session/working-directory/set",
                json!({"sessionId": session_id, "path": path}),
            )
            .await?;
        result["cwd"]
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| "session/working-directory/set response is missing cwd".into())
    }

    pub async fn respond_approval(
        &self,
        request_id: &str,
        outcome: ApprovalOutcome,
    ) -> Result<(), String> {
        self.respond(
            RequestKind::Approval,
            request_id,
            json!({"outcome": outcome}),
        )
        .await
    }

    pub async fn respond_user_question(
        &self,
        request_id: &str,
        answer: Value,
    ) -> Result<(), String> {
        self.respond(RequestKind::Question, request_id, answer)
            .await
    }

    async fn respond(
        &self,
        kind: RequestKind,
        request_id: &str,
        answer: Value,
    ) -> Result<(), String> {
        let id = self
            .pending
            .lock()
            .unwrap()
            .remove(&(kind, request_id.to_owned()))
            .ok_or_else(|| format!("No pending SDK request for {request_id}"))?;
        self.transport.respond_result(id, answer).await
    }

    pub async fn shutdown(&self) {
        let mut process = self.process.lock().await;
        if process.pgid.is_none() {
            return;
        }
        self.stopping.store(true, Ordering::Release);
        if let Err(error) = self
            .transport
            .request("shutdown", None, Duration::from_secs(3))
            .await
        {
            tracing::debug!(%error, "SDK shutdown request failed");
        }
        self.transport.close_writer();
        process.terminate().await;
        if let Some(dispatch) = &self.dispatch {
            dispatch.abort();
        }
        self.stderr.abort();
        self.pending.lock().unwrap().clear();
        let _ = self
            .event_tx
            .send(BackendEvent::WorkerStatus(WorkerStatus::Stopped));
    }
}

impl Drop for SdkAdapter {
    fn drop(&mut self) {
        if let Some(dispatch) = &self.dispatch {
            dispatch.abort();
        }
        self.stderr.abort();
    }
}

struct ProcessGroup {
    child: Child,
    pgid: Option<libc::pid_t>,
}

impl ProcessGroup {
    fn spawn(config: &AppConfig) -> Result<Self, String> {
        let bin = config
            .resolve_dsh_bin()
            .ok_or("Could not find the dsh executable")?;
        let mut command = Command::new(bin);
        command.args(["--profile", &config.profile]);
        let base_dirs = BaseDirs::new();
        let web_patch = base_dirs
            .as_ref()
            .filter(|_| config.profile == "web")
            .map(|dirs| dirs.home_dir().join(".dsh/profiles/web/cordis.patch.yml"));
        let web_patch_resolved = web_patch
            .as_ref()
            .and_then(|path| fs::canonicalize(path).ok());
        let is_web_patch = |patch: &Path| {
            web_patch.as_deref() == Some(patch)
                || web_patch_resolved.as_ref().is_some_and(|resolved| {
                    fs::canonicalize(patch).is_ok_and(|path| path == *resolved)
                })
        };
        let patches: Vec<_> = config
            .patches
            .iter()
            .map(Path::new)
            .filter(|patch| !is_web_patch(patch))
            .collect();
        for patch in &patches {
            command.arg("--patch").arg(patch);
        }
        if config.enable_bridge {
            if let Some(patch) = config.resolve_bridge_patch() {
                let resolved = fs::canonicalize(&patch).ok();
                let already_configured = patches.iter().any(|configured| {
                    **configured == patch
                        || resolved.as_ref().is_some_and(|resolved| {
                            fs::canonicalize(configured).is_ok_and(|path| path == *resolved)
                        })
                });
                if !already_configured && !is_web_patch(&patch) {
                    command.arg("--patch").arg(patch);
                }
            }
        }
        if !matches!(config.profile.as_str(), "sdk" | "sdk-minimal") {
            command.args(["--no-open", "--host", "127.0.0.1", "--port", "0"]);
        }
        if let Some(dirs) = base_dirs {
            let local_bin = dirs.home_dir().join(".local/bin");
            let inherited = env::var_os("PATH");
            let mut paths: Vec<_> = inherited.iter().flat_map(env::split_paths).collect();
            if !paths.contains(&local_bin) {
                paths.push(local_bin);
            }
            command.env(
                "PATH",
                env::join_paths(paths).map_err(|error| error.to_string())?,
            );
        }
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(target_os = "linux")]
        {
            use std::os::unix::process::CommandExt;

            let parent_pid = std::process::id() as libc::pid_t;
            // Only async-signal-safe syscalls are made between fork and exec.
            unsafe {
                command.as_std_mut().pre_exec(move || {
                    if libc::setsid() == -1
                        || libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM) == -1
                    {
                        return Err(io::Error::last_os_error());
                    }
                    // The parent may have exited before prctl installed the signal.
                    if libc::getppid() != parent_pid {
                        return Err(io::Error::from_raw_os_error(libc::ESRCH));
                    }
                    Ok(())
                });
            }
        }
        let child = command
            .spawn()
            .map_err(|error| format!("Could not start dsh: {error}"))?;
        let pgid = child.id().map(|id| id as libc::pid_t);
        Ok(Self { child, pgid })
    }

    fn signal(&self, signal: libc::c_int) -> io::Result<()> {
        if let Some(pgid) = self.pgid {
            #[cfg(target_os = "linux")]
            let target = -pgid;
            #[cfg(not(target_os = "linux"))]
            let target = pgid;
            // pgid is the positive PID returned by spawn for our own child.
            if unsafe { libc::kill(target, signal) } == -1 {
                return Err(io::Error::last_os_error());
            }
        }
        Ok(())
    }

    async fn terminate(&mut self) {
        if let Err(error) = self.signal(libc::SIGTERM) {
            if error.raw_os_error() != Some(libc::ESRCH) {
                tracing::warn!(%error, "Could not send SIGTERM to the dsh process group");
            }
        }
        let exited = timeout(Duration::from_secs(2), async {
            self.child.wait().await?;
            // The group can still contain tools after the worker exits.
            loop {
                match self.signal(0) {
                    Err(error) if error.raw_os_error() == Some(libc::ESRCH) => return Ok(()),
                    Err(error) => return Err(error),
                    Ok(()) => sleep(Duration::from_millis(25)).await,
                }
            }
        })
        .await;
        if !matches!(exited, Ok(Ok(()))) {
            if let Err(error) = self.signal(libc::SIGKILL) {
                if error.raw_os_error() != Some(libc::ESRCH) {
                    tracing::warn!(%error, "Could not send SIGKILL to the dsh process group");
                    let _ = self.child.start_kill();
                }
            }
            if let Err(error) = self.child.wait().await {
                tracing::warn!(%error, "Could not reap the dsh worker");
            }
        }
        self.pgid = None;
    }
}

impl Drop for ProcessGroup {
    fn drop(&mut self) {
        let _ = self.signal(libc::SIGKILL);
    }
}

async fn dispatch_messages(
    mut incoming: mpsc::UnboundedReceiver<IncomingMessage>,
    transport: Arc<JsonRpcTransport>,
    pending: ServerRequests,
    events: mpsc::UnboundedSender<BackendEvent>,
    stopping: Arc<AtomicBool>,
) {
    let mut telemetry = HashMap::new();
    while let Some(message) = incoming.recv().await {
        match message {
            IncomingMessage::Request { id, method, params } => {
                let error = match project_server_request(&method, params) {
                    Ok((key, event)) => {
                        let callbacks = &mut *pending.lock().unwrap();
                        match callbacks.entry(key) {
                            std::collections::hash_map::Entry::Occupied(_) => {
                                (-32602, "Duplicate requestId")
                            }
                            std::collections::hash_map::Entry::Vacant(entry) => {
                                if events.send(event).is_ok() {
                                    entry.insert(id);
                                    continue;
                                }
                                (-32603, "SDK event consumer unavailable")
                            }
                        }
                    }
                    Err(error) => error,
                };
                let _ = timeout(
                    RPC_TIMEOUT,
                    transport.respond_error(id, error.0, error.1.into()),
                )
                .await;
            }
            IncomingMessage::Notification { method, params } => {
                dispatch_notification(&events, &pending, &mut telemetry, &method, params);
            }
        }
    }
    pending.lock().unwrap().clear();
    if !stopping.load(Ordering::Acquire) {
        let _ = events.send(BackendEvent::WorkerStatus(WorkerStatus::Error {
            message: "dsh SDK output stream closed".into(),
        }));
    }
}

fn project_server_request(
    method: &str,
    params: Value,
) -> Result<(RequestKey, BackendEvent), RequestError> {
    let invalid = (-32602, "Invalid params");
    match method {
        "approval/request" => {
            let request_id = Uuid::new_v4().to_string();
            let event = ApprovalRequestEvent {
                request_id: request_id.clone(),
                session_id: params["sessionId"].as_str().ok_or(invalid)?.into(),
                tool_name: params["toolName"].as_str().ok_or(invalid)?.into(),
                call_id: params["callId"].as_str().map(str::to_owned),
                reason: params["reason"].as_str().map(str::to_owned),
            };
            Ok((
                (RequestKind::Approval, request_id),
                BackendEvent::ApprovalRequest(event),
            ))
        }
        "user-question/ask" => {
            let event: UserQuestionRequestEvent =
                serde_json::from_value(params).map_err(|_| invalid)?;
            if !event.questions.is_array() {
                return Err(invalid);
            }
            Ok((
                (RequestKind::Question, event.request_id.clone()),
                BackendEvent::UserQuestion(event),
            ))
        }
        _ => Err((-32601, "Method not found")),
    }
}

fn dispatch_notification(
    events: &mpsc::UnboundedSender<BackendEvent>,
    pending: &ServerRequests,
    telemetry: &mut HashMap<String, SessionTelemetry>,
    method: &str,
    params: Value,
) {
    let event = match method {
        "desktop.stream.delta" => {
            let Ok(event) = serde_json::from_value::<StreamDeltaEvent>(params) else {
                return;
            };
            BackendEvent::StreamDelta(event)
        }
        "session.event" => {
            if let Some(session_id) = params["sessionId"].as_str() {
                let event = &params["event"];
                if let Some(telemetry) = update_telemetry(telemetry, session_id, event) {
                    let _ = events.send(BackendEvent::SessionTelemetry(SessionTelemetryEvent {
                        session_id: session_id.into(),
                        telemetry: telemetry.clone(),
                    }));
                }
                for event in project_session_event(session_id, event) {
                    let _ = events.send(BackendEvent::SessionEvent(event));
                }
            }
            return;
        }
        "session.status" => {
            let Some(session_id) = params["sessionId"].as_str() else {
                return;
            };
            let status = match params["status"].as_str() {
                Some("idle") => SessionRunStatus::Idle,
                Some("running") => SessionRunStatus::Running,
                _ => return,
            };
            BackendEvent::SessionStatus {
                session_id: session_id.into(),
                status,
            }
        }
        "user-question.cancelled" => {
            let Ok(event) = serde_json::from_value::<UserQuestionCancelledEvent>(params) else {
                return;
            };
            pending
                .lock()
                .unwrap()
                .remove(&(RequestKind::Question, event.request_id.clone()));
            BackendEvent::UserQuestionCancelled(event)
        }
        "subagent.started" | "subagent.finished" => {
            let (Some(parent), Some(child)) = (
                params["parentSessionId"].as_str(),
                params["childSessionId"].as_str(),
            ) else {
                return;
            };
            BackendEvent::Subagent(SubagentEvent {
                kind: method.trim_start_matches("subagent.").into(),
                parent_session_id: parent.into(),
                child_session_id: child.into(),
                status: params["status"].as_str().map(str::to_owned),
                stop_reason: params["stopReason"]
                    .as_str()
                    .or_else(|| params["stopReason"]["kind"].as_str())
                    .map(str::to_owned),
            })
        }
        _ => return,
    };
    let _ = events.send(event);
}

fn update_telemetry<'a>(
    sessions: &'a mut HashMap<String, SessionTelemetry>,
    session_id: &str,
    event: &Value,
) -> Option<&'a SessionTelemetry> {
    let data = &event["data"];
    let kind = event["type"].as_str()?;
    match kind {
        "assistant/message" if data["usage"].is_object() => {}
        "request/context" if data["contextWindow"].is_u64() => {}
        "sandbox/mode" if data.is_string() || data["mode"].is_string() => {}
        "approval/policy" if data.is_string() || data["policy"].is_string() => {}
        "turn/start" => {}
        _ => return None,
    }
    let telemetry = sessions.entry(session_id.into()).or_default();
    match kind {
        "assistant/message" => telemetry.add_usage(&data["usage"]),
        "request/context" => telemetry.context_window = data["contextWindow"].as_u64(),
        "sandbox/mode" => {
            telemetry.sandbox_mode = data
                .as_str()
                .or_else(|| data["mode"].as_str())
                .map(str::to_owned);
        }
        "approval/policy" => {
            telemetry.approval_policy = data
                .as_str()
                .or_else(|| data["policy"].as_str())
                .map(str::to_owned);
        }
        "turn/start" => {
            telemetry.turn_count = data["turn"]
                .as_u64()
                .unwrap_or_else(|| telemetry.turn_count.saturating_add(1));
        }
        _ => unreachable!(),
    }
    Some(telemetry)
}

pub fn project_session_event(session_id: &str, event: &Value) -> Vec<UiSessionEvent> {
    let session_id = session_id.to_owned();
    let data = event.get("data").unwrap_or(event);
    let projected = match event["type"].as_str() {
        Some("assistant/message") => project_message(&session_id, event, data, "assistant"),
        Some("tool/result") => project_message(&session_id, event, data, "tool"),
        Some("session/title") => data["title"]
            .as_str()
            .map(|title| UiSessionEvent::TitleUpdated {
                session_id,
                title: title.to_owned(),
            }),
        Some("turn/start") => Some(UiSessionEvent::TurnStarted { session_id }),
        Some("turn/end") => Some(UiSessionEvent::TurnEnded {
            session_id,
            reason: data["reason"]
                .as_str()
                .or_else(|| data["reason"]["kind"].as_str())
                .map(str::to_owned),
        }),
        Some("assistant/attempt") => {
            attempt_failure(data).map(|message| UiSessionEvent::AttemptFailed {
                session_id,
                message: message.to_owned(),
            })
        }
        // The desktop displays submitted inputs locally. The SDK also records injected
        // user context with the same event type.
        Some("user/message") => None,
        _ => None,
    };
    projected.into_iter().collect()
}

fn project_message(
    session_id: &str,
    event: &Value,
    data: &Value,
    role: &str,
) -> Option<UiSessionEvent> {
    let message = decode_message(session_id, event, data, role, None)?;
    Some(UiSessionEvent::Message {
        session_id: session_id.to_owned(),
        message,
    })
}

pub(crate) fn decode_message(
    session_id: &str,
    event: &Value,
    data: &Value,
    role: &str,
    line_number: Option<usize>,
) -> Option<UiMessage> {
    let message = data
        .get("message")
        .filter(|message| message.is_object())
        .unwrap_or(data);
    let content = message
        .get("content")
        .or_else(|| data.get("content"))
        .or_else(|| event.get("content"))
        .or_else(|| data.get("result"))?;
    let is_error = message["isError"]
        .as_bool()
        .or_else(|| data["isError"].as_bool())
        .unwrap_or(false);
    let blocks = if let ("tool", Some(call_id)) =
        (role, tool_use_id(message).or_else(|| tool_use_id(data)))
    {
        vec![UiContentBlock::ToolResult {
            tool_use_id: call_id.to_owned(),
            content: content.clone(),
            is_error,
        }]
    } else if let Some(blocks) = content.as_array() {
        blocks.iter().map(project_block).collect()
    } else if let Some(text) = content.as_str() {
        vec![UiContentBlock::Text {
            text: text.to_owned(),
        }]
    } else {
        vec![project_block(content)]
    };

    let timestamp = event["time"]
        .as_u64()
        .or_else(|| event["timestamp"].as_u64())
        .or_else(|| message["timestamp"].as_u64())
        .unwrap_or_default();
    let id = message["id"]
        .as_str()
        .or_else(|| data["messageId"].as_str())
        .or_else(|| event["id"].as_str())
        .map(str::to_owned)
        .unwrap_or_else(|| {
            // SDK envelopes have a stable per-session sequence even without a message id.
            let sequence = event["seq"]
                .as_u64()
                .or(line_number.map(|line| line as u64))
                .unwrap_or(timestamp);
            format!("{session_id}:{role}:{sequence}")
        });
    Some(UiMessage {
        id,
        role: role.to_owned(),
        blocks,
        timestamp,
        is_error,
    })
}

fn tool_use_id(value: &Value) -> Option<&str> {
    ["toolCallId", "toolUseId", "tool_use_id", "callId"]
        .iter()
        .find_map(|key| value[*key].as_str())
}

fn project_block(block: &Value) -> UiContentBlock {
    fn known(block: &Value) -> Option<UiContentBlock> {
        Some(match block["type"].as_str()? {
            "text" => UiContentBlock::Text {
                text: block["text"].as_str()?.into(),
            },
            "reasoning" | "thinking" => UiContentBlock::Thinking {
                thinking: block["thinking"]
                    .as_str()
                    .or_else(|| block["text"].as_str())?
                    .into(),
            },
            "tool-call" | "tool_use" | "toolUse" => UiContentBlock::ToolUse {
                id: block["id"].as_str()?.into(),
                name: block["name"].as_str()?.into(),
                input: block.get("input").cloned().unwrap_or_else(|| {
                    let arguments = &block["arguments"];
                    arguments
                        .as_str()
                        .and_then(|raw| serde_json::from_str(raw).ok())
                        .unwrap_or_else(|| arguments.clone())
                }),
            },
            "tool_result" | "toolResult" => UiContentBlock::ToolResult {
                tool_use_id: tool_use_id(block)?.into(),
                content: block["content"].clone(),
                is_error: block["isError"]
                    .as_bool()
                    .or_else(|| block["is_error"].as_bool())
                    .unwrap_or(false),
            },
            "image" => {
                let mime_type = block["mimeType"].as_str()?;
                let data_url = if let Some(url) = block["dataUrl"].as_str() {
                    url.to_owned()
                } else {
                    format!("data:{mime_type};base64,{}", block["data"].as_str()?)
                };
                UiContentBlock::Image {
                    mime_type: mime_type.into(),
                    data_url,
                }
            }
            _ => return None,
        })
    }
    known(block).unwrap_or_else(|| UiContentBlock::Unknown { raw: block.clone() })
}

fn attempt_failure(data: &Value) -> Option<&str> {
    fn detail(value: &Value) -> Option<&str> {
        value
            .as_str()
            .or_else(|| value["message"].as_str())
            .or_else(|| value["reason"].as_str())
            .or_else(|| value["code"].as_str())
    }
    for error in [&data["error"], &data["failure"]] {
        if !error.is_null() && *error != false {
            return Some(detail(error).unwrap_or("Assistant attempt failed"));
        }
    }
    data["stream"].as_array()?.iter().rev().find_map(|record| {
        let chunk = record.get("chunk").unwrap_or(record);
        let reason = &chunk["reason"];
        if reason["kind"] == "error" || chunk["type"] == "error" {
            Some(
                detail(&reason["failure"])
                    .or_else(|| detail(&chunk["error"]))
                    .or_else(|| detail(chunk))
                    .unwrap_or("Assistant attempt failed"),
            )
        } else {
            None
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project(event: Value) -> Vec<UiSessionEvent> {
        project_session_event("s", &event)
    }

    #[test]
    fn session_notifications_emit_isolated_telemetry() {
        let (sender, mut receiver) = mpsc::unbounded_channel();
        let pending = ServerRequests::default();
        let mut sessions = HashMap::new();
        let mut send = |session_id: &str, kind: &str, data: Value| {
            dispatch_notification(
                &sender,
                &pending,
                &mut sessions,
                "session.event",
                json!({"sessionId": session_id, "event": {"type": kind, "data": data}}),
            );
        };

        send("first", "turn/start", json!({"turn": 3}));
        send(
            "second",
            "assistant/message",
            json!({"usage": {"output_tokens": 99}}),
        );
        send(
            "first",
            "assistant/message",
            json!({"usage": {
                "input_tokens": 1, "cacheReadTokens": 2, "cache_creation_input_tokens": 3, "outputTokens": 4
            }}),
        );
        send(
            "first",
            "assistant/message",
            json!({"usage": {"output_tokens": 5}}),
        );
        send("first", "request/context", json!({"contextWindow": 100}));
        send("first", "sandbox/mode", json!({"mode": "workspace-write"}));
        send("first", "approval/policy", json!({"policy": "on-request"}));

        let mut last_by_session = HashMap::new();
        while let Ok(event) = receiver.try_recv() {
            if let BackendEvent::SessionTelemetry(event) = event {
                last_by_session.insert(event.session_id, event.telemetry);
            }
        }
        assert_eq!(last_by_session["second"].output_tokens, 99);
        assert_eq!(
            last_by_session["first"],
            SessionTelemetry {
                uncached_input_tokens: 1,
                cache_read_tokens: 2,
                cache_write_tokens: 3,
                output_tokens: 9,
                context_window: Some(100),
                sandbox_mode: Some("workspace-write".into()),
                approval_policy: Some("on-request".into()),
                turn_count: 3,
                ..Default::default()
            }
        );
    }

    #[test]
    fn projects_native_assistant_message() {
        let events = project(json!({
            "type": "assistant/message", "seq": 7, "time": 42,
            "data": {"message": {"id": "m", "content": [
                {"type": "text", "text": "hello"},
                {"type": "reasoning", "text": "thinking"},
                {"type": "tool-call", "id": "c", "name": "read", "arguments": "{\"path\":\"x\"}"}
            ]}}
        }));
        assert_eq!(
            events,
            vec![UiSessionEvent::Message {
                session_id: "s".into(),
                message: UiMessage {
                    id: "m".into(),
                    role: "assistant".into(),
                    timestamp: 42,
                    is_error: false,
                    blocks: vec![
                        UiContentBlock::Text {
                            text: "hello".into()
                        },
                        UiContentBlock::Thinking {
                            thinking: "thinking".into()
                        },
                        UiContentBlock::ToolUse {
                            id: "c".into(),
                            name: "read".into(),
                            input: json!({"path": "x"})
                        },
                    ],
                },
            }]
        );
    }

    #[test]
    fn projects_flat_assistant_content() {
        let blocks = json!([
            {"type": "thinking", "thinking": "thinking"},
            {"type": "tool_use", "id": "c", "name": "read", "input": {}},
            {"type": "tool_result", "tool_use_id": "c", "content": "denied", "is_error": true}
        ]);
        let expected = vec![UiSessionEvent::Message {
            session_id: "s".into(),
            message: UiMessage {
                id: "s:assistant:3".into(),
                role: "assistant".into(),
                timestamp: 0,
                is_error: false,
                blocks: vec![
                    UiContentBlock::Thinking {
                        thinking: "thinking".into(),
                    },
                    UiContentBlock::ToolUse {
                        id: "c".into(),
                        name: "read".into(),
                        input: json!({}),
                    },
                    UiContentBlock::ToolResult {
                        tool_use_id: "c".into(),
                        content: json!("denied"),
                        is_error: true,
                    },
                ],
            },
        }];
        assert_eq!(
            project(json!({"type": "assistant/message", "seq": 3, "content": blocks})),
            expected
        );
        assert_eq!(
            project(json!({"type": "assistant/message", "seq": 3, "data": {"content": blocks}})),
            expected
        );
    }

    #[test]
    fn projects_tool_result_and_keeps_call_identity() {
        let content = json!([{"type": "text", "text": "failed"}]);
        assert_eq!(
            project(json!({
                "type": "tool/result", "time": 43,
                "data": {"message": {"id": "t", "toolCallId": "c", "content": content, "isError": true}}
            })),
            vec![UiSessionEvent::Message {
                session_id: "s".into(),
                message: UiMessage {
                    id: "t".into(),
                    role: "tool".into(),
                    timestamp: 43,
                    is_error: true,
                    blocks: vec![UiContentBlock::ToolResult {
                        tool_use_id: "c".into(),
                        content,
                        is_error: true
                    }],
                },
            }]
        );
    }

    #[test]
    fn projects_title_and_turn_boundaries() {
        assert_eq!(
            project(json!({"type": "session/title", "data": {"title": "New title"}})),
            vec![UiSessionEvent::TitleUpdated {
                session_id: "s".into(),
                title: "New title".into()
            }]
        );
        assert_eq!(
            project(json!({"type": "turn/start", "data": {"turn": 1}})),
            vec![UiSessionEvent::TurnStarted {
                session_id: "s".into()
            }]
        );
        assert_eq!(
            project(json!({"type": "turn/end", "data": {"reason": {"kind": "complete"}}})),
            vec![UiSessionEvent::TurnEnded {
                session_id: "s".into(),
                reason: Some("complete".into())
            }]
        );
    }

    #[test]
    fn projects_failed_attempt() {
        assert_eq!(
            project(json!({"type": "assistant/attempt", "data": {"stream": [
                {"type": "chunk", "chunk": {"type": "finish", "reason": {"kind": "error", "failure": {"message": "provider failed"}}}}
            ]}})),
            vec![UiSessionEvent::AttemptFailed {
                session_id: "s".into(),
                message: "provider failed".into()
            }]
        );
        assert!(project(json!({"type": "assistant/attempt", "data": {"stream": []}})).is_empty());
    }

    #[test]
    fn filters_user_messages() {
        for source in ["system-injection", "user"] {
            assert!(project(json!({"type": "user/message", "data": {"message": {
                "source": {"kind": source}, "content": [{"type": "text", "text": "input"}]
            }}}))
            .is_empty());
        }
    }
}

#[cfg(all(test, target_os = "linux"))]
mod worker_tests {
    use super::*;
    use std::{fs, os::unix::fs::PermissionsExt};

    #[tokio::test]
    async fn worker_routes_callbacks_and_shuts_down() {
        let path = env::temp_dir().join(format!("dsh-sdk-test-{}", Uuid::new_v4()));
        fs::write(&path, r#"#!/bin/sh
set -eu
test "$#" = 6
test "$1 $2 $3 $4 $5 $6" = '--profile sdk --patch first patch --patch second'
IFS= read -r initialize
for required in '"method":"initialize"' '"approvalRequests":true' '"userQuestions":true' '"reasoningEffort":"high"'; do
    case "$initialize" in
        *"$required"*) ;;
        *) exit 1 ;;
    esac
done
printf '%s\n' '{"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"test-sdk","version":"1"}}}'
printf '%s\n' '{"jsonrpc":"2.0","id":"approval-rpc","method":"approval/request","params":{"sessionId":"s","toolName":"read"}}'
printf '%s\n' '{"jsonrpc":"2.0","id":77,"method":"user-question/ask","params":{"requestId":"q","sessionId":"s","questions":[]}}'
IFS= read -r capabilities
test "$capabilities" = '{"id":2,"jsonrpc":"2.0","method":"desktop/capabilities","params":{}}'
printf '%s\n' '{"jsonrpc":"2.0","id":2,"error":{"code":-32601,"message":"Method not found"}}'
IFS= read -r approval
test "$approval" = '{"id":"approval-rpc","jsonrpc":"2.0","result":{"outcome":"allowed-once"}}'
IFS= read -r question
test "$question" = '{"id":77,"jsonrpc":"2.0","result":{"cancelled":true}}'
printf '%s\n' '{"jsonrpc":"2.0","method":"session.status","params":{"sessionId":"s","status":"idle"}}'
IFS= read -r shutdown
test "$shutdown" = '{"id":3,"jsonrpc":"2.0","method":"shutdown"}'
printf '%s\n' '{"jsonrpc":"2.0","id":3,"result":{}}'
"#).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();

        let config = AppConfig {
            dsh_bin: path.to_string_lossy().into_owned(),
            reasoning_effort: Some("high".into()),
            profile: "sdk".into(),
            patches: vec!["first patch".into(), "second".into()],
            enable_bridge: false,
            ..AppConfig::default()
        };
        let (events, mut receiver) = mpsc::unbounded_channel();
        let adapter = SdkAdapter::start(&config, events).await;
        fs::remove_file(path).unwrap();
        let adapter = adapter.unwrap();
        let pgid = adapter.process.lock().await.pgid.unwrap();
        assert_eq!(unsafe { libc::getpgid(pgid) }, pgid);
        timeout(Duration::from_secs(5), async {
            assert_eq!(
                receiver.recv().await.unwrap(),
                BackendEvent::WorkerStatus(WorkerStatus::Starting)
            );
            assert_eq!(adapter.capabilities(), BridgeCapabilities::default());
            assert_eq!(
                receiver.recv().await.unwrap(),
                BackendEvent::BridgeCapabilities(BridgeCapabilities::default())
            );
            assert_eq!(
                receiver.recv().await.unwrap(),
                BackendEvent::WorkerStatus(WorkerStatus::Ready {
                    server_name: "test-sdk".into(),
                    server_version: "1".into(),
                })
            );
            let Some(BackendEvent::ApprovalRequest(approval)) = receiver.recv().await else {
                panic!("expected approval request");
            };
            let Some(BackendEvent::UserQuestion(question)) = receiver.recv().await else {
                panic!("expected user question");
            };
            assert_eq!(question.request_id, "q");
            adapter
                .respond_approval(&approval.request_id, ApprovalOutcome::AllowedOnce)
                .await
                .unwrap();
            adapter
                .respond_user_question(&question.request_id, json!({"cancelled": true}))
                .await
                .unwrap();
            assert_eq!(
                receiver.recv().await.unwrap(),
                BackendEvent::SessionStatus {
                    session_id: "s".into(),
                    status: SessionRunStatus::Idle,
                }
            );
            adapter.shutdown().await;
            assert_eq!(
                receiver.recv().await.unwrap(),
                BackendEvent::WorkerStatus(WorkerStatus::Stopped)
            );
        })
        .await
        .unwrap();
        let mut process = adapter.process.lock().await;
        assert!(process.pgid.is_none());
        assert!(process.child.try_wait().unwrap().is_some());
    }

    #[tokio::test]
    async fn worker_routes_bridge_requests_and_stream_deltas() {
        let path = env::temp_dir().join(format!("dsh-sdk-bridge-test-{}", Uuid::new_v4()));
        fs::write(&path, r#"#!/bin/sh
set -eu
test "$#" = 11
test "$1 $2 $3 $4 $5" = '--profile web --patch first patch --patch'
test -f "$6"
shift 6
test "$*" = '--no-open --host 127.0.0.1 --port 0'
IFS= read -r initialize
printf '%s\n' '{"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"test-bridge","version":"1"}}}'
IFS= read -r capabilities
test "$capabilities" = '{"id":2,"jsonrpc":"2.0","method":"desktop/capabilities","params":{}}'
printf '%s\n' '{"jsonrpc":"2.0","id":2,"result":{"streamDelta":true,"abort":true,"modelControl":true,"hostInfo":true,"pluginManager":true}}'
IFS= read -r host_info
test "$host_info" = '{"id":3,"jsonrpc":"2.0","method":"desktop/host/info","params":{}}'
printf '%s\n' '{"jsonrpc":"2.0","id":3,"result":{"webOrigin":"http://127.0.0.1:12345","authenticatedUrl":"http://127.0.0.1:12345/?token=test","profile":"web","hasWebServer":true,"hasPluginManager":true}}'
printf '%s\n' '{"jsonrpc":"2.0","method":"desktop.stream.delta","params":{"sessionId":"s","blockType":"thinking","delta":"first","reset":true}}'
printf '%s\n' '{"jsonrpc":"2.0","method":"desktop.stream.delta","params":{"sessionId":"s","blockType":"thinking","delta":" next"}}'
IFS= read -r models
test "$models" = '{"id":4,"jsonrpc":"2.0","method":"desktop/models/list","params":{}}'
printf '%s\n' '{"jsonrpc":"2.0","id":4,"result":{"providers":[{"id":"p","name":"Provider","models":[{"id":"m","name":"Model"}]}]}}'
IFS= read -r select
test "$select" = '{"id":5,"jsonrpc":"2.0","method":"desktop/session/set-model","params":{"model":"m","provider":"p","reasoningEffort":"high","sessionId":"s"}}'
printf '%s\n' '{"jsonrpc":"2.0","id":5,"result":{"provider":"p","model":"m","reasoningEffort":"high"}}'
IFS= read -r select
test "$select" = '{"id":6,"jsonrpc":"2.0","method":"desktop/session/set-model","params":{"model":"m","provider":"p","reasoningEffort":null,"sessionId":"s"}}'
printf '%s\n' '{"jsonrpc":"2.0","id":6,"result":{"provider":"p","model":"m","reasoningEffort":null}}'
IFS= read -r abort
test "$abort" = '{"id":7,"jsonrpc":"2.0","method":"desktop/session/abort","params":{"sessionId":"s"}}'
printf '%s\n' '{"jsonrpc":"2.0","id":7,"result":{"aborted":true}}'
IFS= read -r abort
test "$abort" = '{"id":8,"jsonrpc":"2.0","method":"desktop/session/abort","params":{"sessionId":"s"}}'
printf '%s\n' '{"jsonrpc":"2.0","id":8,"result":{"aborted":false}}'
id=9
for mode in read-only workspace-write danger-full-access; do
    policy=ask
    if [ "$mode" = danger-full-access ]; then policy=never; fi
    IFS= read -r permission
    expected=$(printf '{"id":%s,"jsonrpc":"2.0","method":"desktop/session/set-permission","params":{"mode":"%s","sessionId":"s"}}' "$id" "$mode")
    test "$permission" = "$expected"
    printf '{"jsonrpc":"2.0","id":%s,"result":{"sandboxMode":"%s","approvalPolicy":"%s"}}\n' "$id" "$mode" "$policy"
    id=$((id + 1))
done
IFS= read -r plugins
test "$plugins" = '{"id":12,"jsonrpc":"2.0","method":"desktop/plugins/list","params":{}}'
printf '%s\n' '{"jsonrpc":"2.0","id":12,"result":[{"name":"test-plugin","enabled":true,"installed":true,"removable":true,"availability":"available","description":null,"version":"1.0.0","source":null,"error":null,"entries":[{"rowId":"row","moduleName":"test-module","entryId":null}]}]}'
IFS= read -r shutdown
test "$shutdown" = '{"id":13,"jsonrpc":"2.0","method":"shutdown"}'
printf '%s\n' '{"jsonrpc":"2.0","id":13,"result":{}}'
"#).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();

        let config = AppConfig {
            dsh_bin: path.to_string_lossy().into_owned(),
            patches: std::iter::once("first patch".into())
                .chain(BaseDirs::new().map(|dirs| {
                    dirs.home_dir()
                        .join(".dsh/profiles/web/cordis.patch.yml")
                        .to_string_lossy()
                        .into_owned()
                }))
                .collect(),
            ..AppConfig::default()
        };
        let (events, mut receiver) = mpsc::unbounded_channel();
        let adapter = SdkAdapter::start(&config, events).await;
        fs::remove_file(path).unwrap();
        let adapter = adapter.unwrap();
        timeout(Duration::from_secs(5), async {
            let capabilities = BridgeCapabilities {
                stream_delta: true,
                abort: true,
                model_control: true,
                host_info: true,
                plugin_manager: true,
            };
            assert_eq!(adapter.capabilities(), capabilities);
            assert_eq!(
                receiver.recv().await.unwrap(),
                BackendEvent::WorkerStatus(WorkerStatus::Starting)
            );
            assert_eq!(
                receiver.recv().await.unwrap(),
                BackendEvent::BridgeCapabilities(capabilities)
            );
            assert_eq!(
                receiver.recv().await.unwrap(),
                BackendEvent::HostInfo(Some(HostRuntimeInfo {
                    web_origin: Some("http://127.0.0.1:12345".into()),
                    authenticated_url: Some("http://127.0.0.1:12345/?token=test".into()),
                    profile: Some("web".into()),
                    has_web_server: true,
                    has_plugin_manager: true,
                }))
            );
            assert_eq!(
                receiver.recv().await.unwrap(),
                BackendEvent::WorkerStatus(WorkerStatus::Ready {
                    server_name: "test-bridge".into(),
                    server_version: "1".into(),
                })
            );
            for (delta, reset) in [("first", true), (" next", false)] {
                assert_eq!(
                    receiver.recv().await.unwrap(),
                    BackendEvent::StreamDelta(StreamDeltaEvent {
                        session_id: "s".into(),
                        block_type: "thinking".into(),
                        delta: delta.into(),
                        reset,
                    })
                );
            }

            assert_eq!(
                adapter.list_models().await.unwrap(),
                vec![ProviderModels {
                    id: "p".into(),
                    name: "Provider".into(),
                    models: vec![crate::domain::ModelEntry {
                        id: "m".into(),
                        name: "Model".into(),
                        description: None,
                    }],
                }]
            );
            for effort in [Some("high"), None] {
                assert_eq!(
                    adapter
                        .set_session_model("s", "p", "m", effort)
                        .await
                        .unwrap(),
                    SessionModelSelection {
                        provider: "p".into(),
                        model: "m".into(),
                        reasoning_effort: effort.map(str::to_owned),
                    }
                );
            }
            assert!(adapter.abort_session("s").await.unwrap());
            assert!(!adapter.abort_session("s").await.unwrap());
            for mode in ["", "full-access", "READ-ONLY", "read-only "] {
                assert_eq!(
                    adapter.set_session_permission("s", mode).await.unwrap_err(),
                    "mode must be read-only, workspace-write, or danger-full-access"
                );
            }
            for (mode, policy) in [
                ("read-only", "ask"),
                ("workspace-write", "ask"),
                ("danger-full-access", "never"),
            ] {
                assert_eq!(
                    adapter.set_session_permission("s", mode).await.unwrap(),
                    SessionPermission {
                        sandbox_mode: mode.into(),
                        approval_policy: policy.into(),
                    }
                );
            }
            assert_eq!(
                adapter.list_plugins().await.unwrap(),
                vec![PluginBundleInfo {
                    name: "test-plugin".into(),
                    enabled: true,
                    installed: true,
                    removable: true,
                    availability: "available".into(),
                    description: None,
                    version: Some("1.0.0".into()),
                    source: None,
                    error: None,
                    entries: vec![crate::domain::PluginEntryInfo {
                        row_id: "row".into(),
                        module_name: "test-module".into(),
                        entry_id: None,
                    }],
                }]
            );
            adapter.shutdown().await;
        })
        .await
        .unwrap();
    }
}
