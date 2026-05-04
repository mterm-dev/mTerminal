use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use reqwest::blocking::{Client, RequestBuilder};
use serde::Deserialize;
use serde_json::json;

use super::provider::{
    estimate_cost, AiEvent, AiProvider, CompleteRequest, EventSink, ModelInfo, Usage,
};

pub struct OpenAiProvider {
    api_key: Option<String>,
    base_url: String,
    cost_label: &'static str,
    client: Client,
}

impl OpenAiProvider {
    pub fn new(api_key: Option<String>, base_url: String, cost_label: &'static str) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .expect("reqwest client");
        Self {
            api_key,
            base_url: base_url.trim_end_matches('/').to_string(),
            cost_label,
            client,
        }
    }

    fn auth(&self, builder: RequestBuilder) -> RequestBuilder {
        match &self.api_key {
            Some(k) if !k.is_empty() => builder.bearer_auth(k),
            _ => builder,
        }
    }
}

impl AiProvider for OpenAiProvider {
    fn stream_complete(
        &self,
        req: &CompleteRequest,
        sink: EventSink,
        cancel: &AtomicBool,
    ) -> Result<()> {
        let mut messages: Vec<serde_json::Value> = Vec::new();
        if let Some(sys) = &req.system {
            messages.push(json!({"role": "system", "content": sys}));
        }
        for m in &req.messages {
            messages.push(json!({"role": m.role, "content": m.content}));
        }
        let mut body = json!({
            "model": req.model,
            "messages": messages,
            "stream": true,
            "stream_options": { "include_usage": true },
        });
        if let Some(t) = req.temperature {
            body["temperature"] = json!(t);
        }
        if let Some(mt) = req.max_tokens {
            body["max_tokens"] = json!(mt);
        }

        let resp = self
            .auth(
                self.client
                    .post(format!("{}/chat/completions", self.base_url))
                    .header("content-type", "application/json"),
            )
            .json(&body)
            .send()
            .context("openai-compat request")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().unwrap_or_default();
            return Err(anyhow!("{} {}: {}", self.cost_label, status, text));
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
            let payload = match trimmed.strip_prefix("data: ") {
                Some(p) => p,
                None => continue,
            };
            if payload == "[DONE]" {
                break;
            }
            let v: serde_json::Value = match serde_json::from_str(payload) {
                Ok(v) => v,
                Err(_) => continue,
            };
            if let Some(choices) = v.get("choices").and_then(|c| c.as_array()) {
                for choice in choices {
                    if let Some(text) = choice
                        .get("delta")
                        .and_then(|d| d.get("content"))
                        .and_then(|c| c.as_str())
                    {
                        if !text.is_empty() {
                            sink(AiEvent::Delta(text.to_string()));
                        }
                    }
                }
            }
            if let Some(u) = v.get("usage") {
                if let Some(p) = u.get("prompt_tokens").and_then(|x| x.as_u64()) {
                    in_tokens = p as u32;
                }
                if let Some(c) = u.get("completion_tokens").and_then(|x| x.as_u64()) {
                    out_tokens = c as u32;
                }
            }
        }

        let cost = estimate_cost(self.cost_label, &req.model, in_tokens, out_tokens);
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
        }
        let resp = self
            .auth(self.client.get(format!("{}/models", self.base_url)))
            .send()
            .context("openai-compat models")?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().unwrap_or_default();
            return Err(anyhow!("{} models {}: {}", self.cost_label, status, text));
        }
        let parsed: ModelsResp = resp.json().context("parse models")?;
        Ok(parsed
            .data
            .into_iter()
            .map(|m| ModelInfo {
                name: m.id.clone(),
                id: m.id,
            })
            .collect())
    }
}
