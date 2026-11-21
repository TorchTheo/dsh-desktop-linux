use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use serde_json::{json, Value};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader},
    sync::{mpsc, oneshot},
    task::JoinHandle,
    time::timeout,
};

type RpcResult = Result<Value, String>;

#[derive(Debug, PartialEq)]
pub enum IncomingMessage {
    Request {
        id: Value,
        method: String,
        params: Value,
    },
    Notification {
        method: String,
        params: Value,
    },
}

#[derive(Default)]
struct Pending {
    closed: Option<String>,
    requests: HashMap<u64, oneshot::Sender<RpcResult>>,
}

impl Pending {
    fn close(&mut self, error: String) {
        if self.closed.is_none() {
            for (_, reply) in self.requests.drain() {
                let _ = reply.send(Err(error.clone()));
            }
            self.closed = Some(error);
        }
    }
}

struct PendingRequest<'a> {
    id: u64,
    pending: &'a Mutex<Pending>,
}

impl Drop for PendingRequest<'_> {
    fn drop(&mut self) {
        self.pending.lock().unwrap().requests.remove(&self.id);
    }
}

struct Outgoing {
    frame: Value,
    written: oneshot::Sender<Result<(), String>>,
}

pub struct JsonRpcTransport {
    outgoing: mpsc::Sender<Outgoing>,
    pending: Arc<Mutex<Pending>>,
    next_id: AtomicU64,
    reader: JoinHandle<()>,
    writer: JoinHandle<()>,
}

impl JsonRpcTransport {
    pub fn new(
        reader: impl AsyncRead + Send + Unpin + 'static,
        writer: impl AsyncWrite + Send + Unpin + 'static,
        incoming: mpsc::UnboundedSender<IncomingMessage>,
    ) -> Self {
        let pending = Arc::new(Mutex::new(Pending::default()));
        let (outgoing, queue) = mpsc::channel(64);
        let reader = tokio::spawn(read_frames(reader, incoming, Arc::clone(&pending)));
        let writer = tokio::spawn(write_frames(writer, queue, Arc::clone(&pending)));
        Self {
            outgoing,
            pending,
            next_id: AtomicU64::new(1),
            reader,
            writer,
        }
    }

    pub async fn request(
        &self,
        method: &str,
        params: Option<Value>,
        deadline: Duration,
    ) -> RpcResult {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (reply, response) = oneshot::channel();
        {
            let mut pending = self.pending.lock().unwrap();
            if let Some(error) = &pending.closed {
                return Err(error.clone());
            }
            pending.requests.insert(id, reply);
        }
        let _request = PendingRequest {
            id,
            pending: &self.pending,
        };
        let mut frame = json!({"jsonrpc": "2.0", "id": id, "method": method});
        if let Some(params) = params {
            frame["params"] = params;
        }
        timeout(deadline, async {
            // A closed read side must wake the caller even if the writer is blocked.
            tokio::select! {
                biased;
                result = response => result.map_err(|_| "JSON-RPC response channel closed".to_string())?,
                error = async {
                    match self.send(frame).await {
                        Ok(()) => std::future::pending().await,
                        Err(error) => error,
                    }
                } => Err(error),
            }
        })
        .await
        .map_err(|_| format!("JSON-RPC request {method} timed out"))?
    }

    pub async fn respond_result(&self, id: Value, result: Value) -> Result<(), String> {
        self.send(json!({"jsonrpc": "2.0", "id": id, "result": result}))
            .await
    }

    pub async fn respond_error(&self, id: Value, code: i64, message: String) -> Result<(), String> {
        self.send(json!({"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}}))
            .await
    }

    async fn send(&self, frame: Value) -> Result<(), String> {
        let (written, receipt) = oneshot::channel();
        self.outgoing
            .send(Outgoing { frame, written })
            .await
            .map_err(|_| self.write_error())?;
        receipt.await.map_err(|_| self.write_error())?
    }

    pub(super) fn close_writer(&self) {
        self.pending
            .lock()
            .unwrap()
            .close("JSON-RPC transport is shutting down".into());
        self.writer.abort();
    }

    fn write_error(&self) -> String {
        self.pending
            .lock()
            .unwrap()
            .closed
            .clone()
            .unwrap_or_else(|| "JSON-RPC writer closed".into())
    }
}

impl Drop for JsonRpcTransport {
    fn drop(&mut self) {
        self.reader.abort();
        self.writer.abort();
    }
}

async fn read_frames(
    reader: impl AsyncRead + Unpin,
    incoming: mpsc::UnboundedSender<IncomingMessage>,
    pending: Arc<Mutex<Pending>>,
) {
    // Byte-oriented splitting also lets us skip malformed UTF-8 without losing the stream.
    let mut lines = BufReader::new(reader).split(b'\n');
    let error = loop {
        let line = match lines.next_segment().await {
            Ok(Some(line)) => line,
            Ok(None) => break "JSON-RPC read stream reached EOF".to_string(),
            Err(error) => break format!("JSON-RPC read failed: {error}"),
        };
        let Ok(Value::Object(mut frame)) = serde_json::from_slice(&line) else {
            tracing::warn!(bytes = line.len(), "Skipping non-object JSON-RPC line");
            continue;
        };
        if frame.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
            tracing::warn!("Skipping frame without JSON-RPC 2.0 version");
            continue;
        }
        let id = frame.remove("id");
        if let Some(Value::String(method)) = frame.remove("method") {
            let params = frame.remove("params").unwrap_or(Value::Null);
            let message = match id {
                Some(id) => IncomingMessage::Request { id, method, params },
                None => IncomingMessage::Notification { method, params },
            };
            let _ = incoming.send(message);
        } else if let Some(id) = id.and_then(|id| id.as_u64()) {
            let reply = pending.lock().unwrap().requests.remove(&id);
            if let Some(reply) = reply {
                let result = match (frame.remove("result"), frame.remove("error")) {
                    (Some(result), None) => Ok(result),
                    (None, Some(error)) => Err(format!(
                        "JSON-RPC error {}: {}",
                        error["code"],
                        error["message"].as_str().unwrap_or("Unknown error")
                    )),
                    _ => Err("Invalid JSON-RPC response".into()),
                };
                let _ = reply.send(result);
            }
        }
    };
    pending.lock().unwrap().close(error);
}

async fn write_frames(
    mut writer: impl AsyncWrite + Unpin,
    mut queue: mpsc::Receiver<Outgoing>,
    pending: Arc<Mutex<Pending>>,
) {
    while let Some(Outgoing { frame, written }) = queue.recv().await {
        if written.is_closed() {
            continue;
        }
        let mut bytes = frame.to_string().into_bytes();
        bytes.push(b'\n');
        let result = async {
            writer.write_all(&bytes).await?;
            writer.flush().await
        }
        .await
        .map_err(|error| format!("JSON-RPC write failed: {error}"));
        if let Err(error) = &result {
            pending.lock().unwrap().close(error.clone());
            let _ = written.send(result);
            break;
        }
        let _ = written.send(result);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{duplex, split, BufStream, DuplexStream};

    const DEADLINE: Duration = Duration::from_secs(2);

    fn harness() -> (
        JsonRpcTransport,
        BufStream<DuplexStream>,
        mpsc::UnboundedReceiver<IncomingMessage>,
    ) {
        let (client, server) = duplex(4096);
        let (read, write) = split(client);
        let (incoming, events) = mpsc::unbounded_channel();
        (
            JsonRpcTransport::new(read, write, incoming),
            BufStream::new(server),
            events,
        )
    }

    async fn read_frame(server: &mut BufStream<DuplexStream>) -> Value {
        let mut line = String::new();
        timeout(DEADLINE, server.read_line(&mut line))
            .await
            .unwrap()
            .unwrap();
        serde_json::from_str(&line).unwrap()
    }

    async fn write_frame(server: &mut BufStream<DuplexStream>, frame: Value) {
        server
            .write_all(format!("{frame}\n").as_bytes())
            .await
            .unwrap();
        server.flush().await.unwrap();
    }

    #[tokio::test]
    async fn request_and_response() {
        let (rpc, mut server, _) = harness();
        let (reply, ()) = tokio::join!(
            rpc.request("ping", Some(json!({"value": 42})), DEADLINE),
            async {
                let frame = read_frame(&mut server).await;
                assert_eq!(
                    frame,
                    json!({"jsonrpc": "2.0", "id": 1, "method": "ping", "params": {"value": 42}})
                );
                write_frame(
                    &mut server,
                    json!({"jsonrpc": "2.0", "id": frame["id"], "result": null}),
                )
                .await;
            },
        );
        assert_eq!(reply.unwrap(), Value::Null);
    }

    #[tokio::test]
    async fn skips_malformed_lines_and_dispatches_notifications() {
        let (rpc, mut server, mut events) = harness();
        let (reply, ()) = tokio::join!(rpc.request("ping", None, DEADLINE), async {
            let frame = read_frame(&mut server).await;
            server.write_all(b"startup log\n[]\n\xff\n").await.unwrap();
            write_frame(&mut server, json!({"jsonrpc": "2.0", "method": "notice"})).await;
            write_frame(
                &mut server,
                json!({"jsonrpc": "2.0", "id": frame["id"], "result": true}),
            )
            .await;
        },);
        assert_eq!(reply.unwrap(), true);
        assert_eq!(
            events.try_recv().unwrap(),
            IncomingMessage::Notification {
                method: "notice".into(),
                params: Value::Null,
            }
        );
    }

    #[tokio::test]
    async fn handles_reverse_requests_while_a_client_request_is_pending() {
        let (rpc, mut server, mut events) = harness();
        let (reply, (), ()) = tokio::join!(
            rpc.request("query", None, DEADLINE),
            async {
                let query = read_frame(&mut server).await;
                write_frame(&mut server, json!({
                    "jsonrpc": "2.0", "method": "approval/request", "id": "a", "params": {"toolName": "read"}
                })).await;
                assert_eq!(
                    read_frame(&mut server).await,
                    json!({"jsonrpc": "2.0", "id": "a", "result": {"outcome": "rejected"}})
                );
                write_frame(
                    &mut server,
                    json!({"jsonrpc": "2.0", "method": "unknown", "id": 1}),
                )
                .await;
                assert_eq!(
                    read_frame(&mut server).await,
                    json!({"jsonrpc": "2.0", "id": 1, "error": {"code": -32601, "message": "Method not found"}})
                );
                write_frame(
                    &mut server,
                    json!({"jsonrpc": "2.0", "id": query["id"], "result": {"messageId": "m"}}),
                )
                .await;
            },
            async {
                assert_eq!(
                    timeout(DEADLINE, events.recv()).await.unwrap().unwrap(),
                    IncomingMessage::Request {
                        id: json!("a"),
                        method: "approval/request".into(),
                        params: json!({"toolName": "read"}),
                    }
                );
                rpc.respond_result(json!("a"), json!({"outcome": "rejected"}))
                    .await
                    .unwrap();
                assert_eq!(
                    timeout(DEADLINE, events.recv()).await.unwrap().unwrap(),
                    IncomingMessage::Request {
                        id: json!(1),
                        method: "unknown".into(),
                        params: Value::Null,
                    }
                );
                rpc.respond_error(json!(1), -32601, "Method not found".into())
                    .await
                    .unwrap();
            },
        );
        assert_eq!(reply.unwrap(), json!({"messageId": "m"}));
    }

    #[tokio::test]
    async fn eof_wakes_all_pending_requests() {
        let (rpc, mut server, _) = harness();
        let (one, two, ()) = tokio::join!(
            rpc.request("one", None, DEADLINE),
            rpc.request("two", None, DEADLINE),
            async move {
                read_frame(&mut server).await;
                read_frame(&mut server).await;
            },
        );
        assert!(one.unwrap_err().contains("EOF"));
        assert!(two.unwrap_err().contains("EOF"));
        assert!(rpc
            .request("later", None, DEADLINE)
            .await
            .unwrap_err()
            .contains("EOF"));
    }
}
