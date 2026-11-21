//! Run with `cargo run --example sdk_smoke`. Override the route with
//! `DSH_SMOKE_PROVIDER` and `DSH_SMOKE_MODEL`. Set `DSH_SMOKE_PATCH` to a
//! local Cordis patch that registers the route if the SDK profile lacks it.

use serde_json::{json, Value};
use std::{env, error::Error, io, path::PathBuf, process::Stdio, time::Duration};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Split},
    process::{ChildStdin, ChildStdout, Command},
    time::timeout,
};
use uuid::Uuid;

type Result<T> = std::result::Result<T, Box<dyn Error>>;

struct Wire {
    input: ChildStdin,
    output: Split<BufReader<ChildStdout>>,
    non_json: usize,
}

impl Wire {
    async fn send(&mut self, frame: Value) -> Result<()> {
        let mut bytes = serde_json::to_vec(&frame)?;
        bytes.push(b'\n');
        self.input.write_all(&bytes).await?;
        Ok(())
    }

    async fn request(&mut self, id: u64, method: &str, params: Value) -> Result<()> {
        let mut frame = json!({"jsonrpc": "2.0", "id": id, "method": method});
        if !params.is_null() {
            frame["params"] = params;
        }
        self.send(frame).await
    }

    async fn receive(&mut self) -> Result<Option<Value>> {
        while let Some(line) = self.output.next_segment().await? {
            let Ok(frame) = serde_json::from_slice::<Value>(&line) else {
                self.non_json += 1;
                eprintln!("dsh stdout 非 JSON 行，已忽略（{} 字节）", line.len());
                continue;
            };
            if frame["jsonrpc"] != "2.0" {
                eprintln!("dsh stdout 非 JSON-RPC 帧，已忽略");
                continue;
            }
            if let (Some(id), Some(method)) = (frame.get("id"), frame["method"].as_str()) {
                let mut response = json!({"jsonrpc": "2.0", "id": id});
                match method {
                    "approval/request" => {
                        eprintln!("approval/request → rejected");
                        response["result"] = json!({"outcome": "rejected"});
                    }
                    "user-question/ask" => {
                        eprintln!("user-question/ask → cancelled");
                        response["result"] = json!({"cancelled": true});
                    }
                    _ => response["error"] = json!({"code": -32601, "message": "Method not found"}),
                }
                self.send(response).await?;
                continue;
            }
            return Ok(Some(frame));
        }
        Ok(None)
    }

    async fn next(&mut self) -> Result<Value> {
        self.receive()
            .await?
            .ok_or_else(|| "dsh stdout 提前关闭".into())
    }

    async fn response(&mut self, id: u64, method: &str) -> Result<Value> {
        loop {
            let frame = self.next().await?;
            if frame["id"] == id {
                return rpc_result(frame, method);
            }
        }
    }
}

fn rpc_result(mut frame: Value, method: &str) -> Result<Value> {
    if let Some(result) = frame.get_mut("result") {
        return Ok(result.take());
    }
    // Error messages and data can contain provider diagnostics or credentials.
    Err(format!(
        "{method} 失败（RPC code {:?}）",
        frame["error"]["code"].as_i64()
    )
    .into())
}

async fn handshake(wire: &mut Wire, provider: &str, model: &str) -> Result<()> {
    wire.request(
        1,
        "initialize",
        json!({
            "cwd": env::current_dir()?,
            "provider": provider,
            "model": model,
            "approvalRequests": true,
            "capabilities": {"userQuestions": true}
        }),
    )
    .await?;
    let result = wire.response(1, "initialize").await?;
    let info = &result["serverInfo"];
    let (Some(name), Some(version)) = (info["name"].as_str(), info["version"].as_str()) else {
        return Err("initialize 缺少 serverInfo.name 或 serverInfo.version".into());
    };
    println!("serverInfo: {}", json!({"name": name, "version": version}));
    Ok(())
}

async fn query(wire: &mut Wire) -> Result<()> {
    let session_id = Uuid::new_v4().to_string();
    wire.request(
        2,
        "session/query",
        json!({
            "sessionId": session_id,
            "contentBlocks": [{"type": "text", "text": "请只回复 OK，不要调用任何工具"}]
        }),
    )
    .await?;

    let mut accepted = false;
    let mut running = false;
    let mut idle = false;
    let mut events = Vec::new();
    let mut assistant = String::new();
    // Notifications can arrive before the query receipt.
    while !(accepted && idle) {
        let frame = wire.next().await?;
        if frame["id"] == 2 {
            rpc_result(frame, "session/query")?;
            accepted = true;
            continue;
        }
        let params = &frame["params"];
        if params["sessionId"] != session_id.as_str() {
            continue;
        }
        match frame["method"].as_str() {
            Some("session.status") => match params["status"].as_str() {
                Some("running") => {
                    running = true;
                    println!("session.status: running");
                }
                Some("idle") if running => {
                    idle = true;
                    println!("session.status: idle");
                }
                _ => {}
            },
            Some("session.event") => {
                let event = &params["event"];
                if let Some(kind) = event["type"].as_str() {
                    events.push(kind.to_owned());
                    println!("session.event: {kind}");
                    if kind == "assistant/message" {
                        if let Some(blocks) = event
                            .pointer("/data/message/content")
                            .and_then(Value::as_array)
                        {
                            for block in blocks.iter().filter(|block| block["type"] == "text") {
                                if let Some(text) = block["text"].as_str() {
                                    assistant.push_str(text);
                                }
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
    println!("session.event 类型序列: {}", events.join(", "));
    match assistant.trim() {
        "OK" => println!("助手回复: OK"),
        "" => return Err("会话已空闲，但未收到助手文本".into()),
        other => {
            return Err(format!(
                "助手回复偏离预期（{} 字符，原文省略）",
                other.chars().count()
            )
            .into())
        }
    }
    Ok(())
}

fn start_dsh() -> io::Result<tokio::process::Child> {
    fn spawn(program: impl AsRef<std::ffi::OsStr>) -> io::Result<tokio::process::Child> {
        let mut command = Command::new(program);
        command.args(["--profile", "sdk"]);
        if let Some(patch) = env::var_os("DSH_SMOKE_PATCH") {
            command.arg("--patch").arg(patch);
        }
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
    }

    match spawn("dsh") {
        Err(error) if error.kind() == io::ErrorKind::NotFound => match env::var_os("HOME") {
            Some(home) => spawn(PathBuf::from(home).join(".local/bin/dsh")),
            None => Err(error),
        },
        result => result,
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<()> {
    let provider = env::var("DSH_SMOKE_PROVIDER").unwrap_or_else(|_| "wb".into());
    let model = env::var("DSH_SMOKE_MODEL").unwrap_or_else(|_| "cn:hy4flash-free".into());
    println!("provider/model: {provider} / {model}");

    let mut child = start_dsh()?;
    let mut wire = Wire {
        input: child.stdin.take().expect("piped stdin"),
        output: BufReader::new(child.stdout.take().expect("piped stdout")).split(b'\n'),
        non_json: 0,
    };
    // Drain stderr concurrently without forwarding raw provider diagnostics.
    let mut stderr = child.stderr.take().expect("piped stderr");
    let stderr_task =
        tokio::spawn(async move { tokio::io::copy(&mut stderr, &mut tokio::io::sink()).await });

    let outcome = match timeout(
        Duration::from_secs(20),
        handshake(&mut wire, &provider, &model),
    )
    .await
    {
        Ok(Ok(())) => match timeout(Duration::from_secs(45), query(&mut wire)).await {
            Ok(result) => result,
            Err(_) => Err("等待 session/query 完成超时（45 秒）".into()),
        },
        Ok(Err(error)) => Err(error),
        Err(_) => Err("initialize 超时（20 秒）".into()),
    };

    let shutdown = timeout(Duration::from_secs(10), async {
        wire.request(3, "shutdown", Value::Null).await?;
        wire.response(3, "shutdown").await?;
        Ok::<_, Box<dyn Error>>(())
    })
    .await;

    let Wire {
        input,
        mut output,
        mut non_json,
    } = wire;
    // The SDK CLI also uses stdin EOF as its process-lifetime signal.
    drop(input);
    let exit = timeout(Duration::from_secs(10), async {
        while let Some(line) = output.next_segment().await? {
            if serde_json::from_slice::<Value>(&line).is_err() {
                non_json += 1;
                eprintln!("dsh stdout 非 JSON 行，已忽略（{} 字节）", line.len());
            }
        }
        child.wait().await
    })
    .await;
    let status = match exit {
        Ok(result) => result?,
        Err(_) => {
            child.start_kill()?;
            child.wait().await?
        }
    };
    stderr_task.abort();
    println!("非 JSON stdout 行: {non_json}");
    println!("dsh 退出状态: {status}");

    outcome?;
    shutdown.map_err(|_| "shutdown 回执超时（10 秒）")??;
    if !status.success() {
        return Err("dsh 未以退出码 0 结束".into());
    }
    Ok(())
}
