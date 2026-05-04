use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::json;

use super::provider::{
    estimate_cost, AiEvent, AiProvider, CompleteRequest, EventSink, ModelInfo, Usage,
};

const ANTHROPIC_VERSION: &str = "2023-06-01";
const BASE: &str = "https://api.anthropic.com/v1";

pub struct AnthropicProvider {
    api_key: String,
    client: Client,
}

impl AnthropicProvider {
    pub fn new(api_key: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .expect("reqwest client");
        Self { api_key, client }
    }
}

impl AiProvider for AnthropicProvider {
    fn stream_complete(
        &self,
        req: &CompleteRequest,
        sink: EventSink,
        cancel: &AtomicBool,
    ) -> Result<()> {
        let mut body = json!({
            "model": req.model,
            "max_tokens": req.max_tokens.unwrap_or(4096),
            "stream": true,
            "messages": req.messages.iter().map(|m| json!({
                "role": m.role,
                "content": m.content,
            })).collect::<Vec<_>>(),
        });
        if let Some(sys) = &req.system {
            body["system"] = json!(sys);
        }
        if let Some(t) = req.temperature {
            body["temperature"] = json!(t);
        }

        let resp = self
            .client
            .post(format!("{BASE}/messages"))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .context("anthropic request")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().unwrap_or_default();
            return Err(anyhow!("anthropic {}: {}", status, text));
        }

        let mut reader = BufReader::new(resp);
        let mut line = String::new();
        let mut in_tokens: u32 = 0;
        let mut out_tokens: u32 = 0;

        loop {
            if cancel.load(Ordering::SeqCst) {
                return Ok(());
            }
            line.clear();
            let n = reader.read_line(&mut line).context("read sse line")?;
            if n == 0 {
                break;
            }
            let trimmed = line.trim_end_matches(['\r', '\n']);
            if let Some(payload) = trimmed.strip_prefix("data: ") {
                if payload.is_empty() {
                    continue;
                }
                let v: serde_json::Value = match serde_json::from_str(payload) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                match v.get("type").and_then(|t| t.as_str()) {
                    Some("content_block_delta") => {
                        if let Some(text) = v
                            .get("delta")
                            .and_then(|d| d.get("text"))
                            .and_then(|t| t.as_str())
                        {
                            sink(AiEvent::Delta(text.to_string()));
                        }
                    }
                    Some("message_start") => {
                        if let Some(u) = v.get("message").and_then(|m| m.get("usage")) {
                            in_tokens = u
                                .get("input_tokens")
                                .and_then(|x| x.as_u64())
                                .unwrap_or(0) as u32;
                            out_tokens = u
                                .get("output_tokens")
                                .and_then(|x| x.as_u64())
                                .unwrap_or(0) as u32;
                        }
                    }
                    Some("message_delta") => {
                        if let Some(u) = v.get("usage") {
                            if let Some(o) =
                                u.get("output_tokens").and_then(|x| x.as_u64())
                            {
                                out_tokens = o as u32;
                            }
                        }
                    }
                    Some("message_stop") => break,
                    _ => {}
                }
            }
        }

        let cost = estimate_cost("anthropic", &req.model, in_tokens, out_tokens);
        sink(AiEvent::Done(Usage {
            in_tokens,
            out_tokens,
            cost_usd: cost,
        }));
        Ok(())
    }

    fn list_models(&self) -> Result<Vec<ModelInfo>> {
        #[derive(Deserialize)]
        struct ModelsResp {
            data: Vec<ModelEntry>,
        }
        #[derive(Deserialize)]
        struct ModelEntry {
            id: String,
            display_name: Option<String>,
        }

        let resp = self
            .client
            .get(format!("{BASE}/models"))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .send()
            .context("anthropic models")?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().unwrap_or_default();
            return Err(anyhow!("anthropic models {}: {}", status, text));
        }
        let parsed: ModelsResp = resp.json().context("parse models")?;
        Ok(parsed
            .data
            .into_iter()
            .map(|m| ModelInfo {
                name: m.display_name.clone().unwrap_or_else(|| m.id.clone()),
                id: m.id,
            })
            .collect())
    }
}
