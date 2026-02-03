// OpenAI Stream Collector
// Used for auto-converting streaming responses to JSON for non-streaming requests

use super::models::*;
use bytes::Bytes;
use futures::StreamExt;
use serde_json::Value;

/// Collects an OpenAI SSE stream into a complete OpenAIResponse
pub async fn collect_stream_to_json<S, E>(
    mut stream: S,
) -> Result<OpenAIResponse, String>
where
    S: futures::Stream<Item = Result<Bytes, E>> + Unpin,
    E: std::fmt::Display,
{
    let mut response = OpenAIResponse {
        id: "chatcmpl-unknown".to_string(),
        object: "chat.completion".to_string(),
        created: chrono::Utc::now().timestamp() as u64,
        model: "unknown".to_string(),
        choices: Vec::new(),
        usage: None,
    };

    let mut role: Option<String> = None;
    let mut content_parts: Vec<String> = Vec::new();
    let mut reasoning_parts: Vec<String> = Vec::new();
    let mut finish_reason: Option<String> = None;
    let _tool_calls: Vec<Value> = Vec::new(); // Store as Value to be flexible with partials

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.lines() {
            let line = line.trim();
            if line.starts_with("data: ") {
                let data_str = line.trim_start_matches("data: ").trim();
                if data_str == "[DONE]" {
                    continue;
                }

                if let Ok(json) = serde_json::from_str::<Value>(data_str) {
                    // Update meta fields
                    if let Some(id) = json.get("id").and_then(|v| v.as_str()) {
                        response.id = id.to_string();
                    }
                    if let Some(model) = json.get("model").and_then(|v| v.as_str()) {
                        response.model = model.to_string();
                    }
                    if let Some(created) = json.get("created").and_then(|v| v.as_u64()) {
                        response.created = created;
                    }

                    // Collect Usage
                    if let Some(usage) = json.get("usage") {
                        if let Ok(u) = serde_json::from_value::<OpenAIUsage>(usage.clone()) {
                            response.usage = Some(u);
                        }
                    }

                    // Collect Choices Delta
                    if let Some(choices) = json.get("choices").and_then(|v| v.as_array()) {
                        if let Some(choice) = choices.first() {
                            if let Some(delta) = choice.get("delta") {
                                // Role
                                if let Some(r) = delta.get("role").and_then(|v| v.as_str()) {
                                    role = Some(r.to_string());
                                }
                                
                                // Content
                                if let Some(c) = delta.get("content").and_then(|v| v.as_str()) {
                                    content_parts.push(c.to_string());
                                }

                                // Reasoning Content
                                if let Some(rc) = delta.get("reasoning_content").and_then(|v| v.as_str()) {
                                    reasoning_parts.push(rc.to_string());
                                }

                                // Tool Calls Logic would go here (simplified for now as usually not mixed with non-stream heavy)
                                // But proper implementation needs to aggregate tool calls by index.
                            }

                            if let Some(fr) = choice.get("finish_reason").and_then(|v| v.as_str()) {
                                finish_reason = Some(fr.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    // Construct final message
    let full_content = content_parts.join("");
    let full_reasoning = if reasoning_parts.is_empty() {
        None
    } else {
        Some(reasoning_parts.join(""))
    };

    let message = OpenAIMessage {
        role: role.unwrap_or("assistant".to_string()),
        content: Some(OpenAIContent::String(full_content)),
        reasoning_content: full_reasoning,
        tool_calls: None, // TODO: Implement tool call aggregation if needed
        tool_call_id: None,
        name: None,
    };

    response.choices.push(Choice {
        index: 0,
        message,
        finish_reason: finish_reason.or(Some("stop".to_string())),
    });

    Ok(response)
}
