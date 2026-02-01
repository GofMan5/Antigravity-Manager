// Claude Messages Handler
// POST /v1/messages - Main message processing endpoint

use axum::{
    body::Body,
    extract::{Json, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use bytes::Bytes;
use futures::StreamExt;
use serde_json::{json, Value};
use tokio::time::Duration;
use tracing::{debug, error, info};

use crate::proxy::mappers::claude::{
    transform_claude_request_in, transform_response, create_claude_sse_stream, ClaudeRequest,
    filter_invalid_thinking_blocks_with_family, close_tool_loop_for_thinking,
    clean_cache_control_from_messages, merge_consecutive_messages,
};
use crate::proxy::server::AppState;
use crate::proxy::mappers::context_manager::ContextManager;
use crate::proxy::mappers::estimation_calibrator::get_calibrator;
use crate::proxy::debug_logger;
use axum::http::HeaderMap;
use std::sync::atomic::Ordering;

use super::super::common::{determine_retry_strategy, apply_retry_strategy, should_rotate_account, RetryStrategy};
use super::warmup::{is_warmup_request, create_warmup_response};
use super::background::{detect_background_task_type, select_background_model, INTERNAL_BACKGROUND_TASK};
use super::compression::{try_compress_with_summary, CONTEXT_SUMMARY_PROMPT};

const MAX_RETRY_ATTEMPTS: usize = 3;

/// Handle Claude messages request
pub async fn handle_messages(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    // Save original request body for logging
    let original_body = body.clone();
    
    tracing::debug!("handle_messages called. Body JSON len: {}", body.to_string().len());
    
    // Generate random Trace ID
    let trace_id: String = rand::Rng::sample_iter(rand::thread_rng(), &rand::distributions::Alphanumeric)
        .take(6)
        .map(char::from)
        .collect::<String>().to_lowercase();
    let debug_cfg = state.debug_logging.read().await.clone();
        
    // Decide whether to use z.ai or Google flow
    let zai = state.zai.read().await.clone();
    let zai_enabled = zai.enabled && !matches!(zai.dispatch_mode, crate::proxy::ZaiDispatchMode::Off);
    let google_accounts = state.token_manager.len();

    // Parse request to get model info
    let mut request: crate::proxy::mappers::claude::models::ClaudeRequest = match serde_json::from_value(body) {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "type": "error",
                    "error": {
                        "type": "invalid_request_error",
                        "message": format!("Invalid request body: {}", e)
                    }
                }))
            ).into_response();
        }
    };

    if debug_logger::is_enabled(&debug_cfg) {
        let original_payload = json!({
            "kind": "original_request",
            "protocol": "anthropic",
            "trace_id": trace_id,
            "original_model": request.model,
            "request": original_body,
        });
        debug_logger::write_debug_payload(&debug_cfg, Some(&trace_id), "original_request", &original_payload).await;
    }

    // Normalize model name for quota protection check
    let normalized_model = crate::proxy::common::model_mapping::normalize_to_standard_id(&request.model)
        .unwrap_or_else(|| request.model.clone());

    let use_zai = if !zai_enabled {
        false
    } else {
        match zai.dispatch_mode {
            crate::proxy::ZaiDispatchMode::Off => false,
            crate::proxy::ZaiDispatchMode::Exclusive => true,
            crate::proxy::ZaiDispatchMode::Fallback => {
                if google_accounts == 0 {
                    tracing::info!("[{}] No Google accounts available, using fallback provider", trace_id);
                    true
                } else {
                    let has_available = state.token_manager.has_available_account("claude", &normalized_model).await;
                    if !has_available {
                        tracing::info!(
                            "[{}] All Google accounts unavailable (rate-limited or quota-protected for {}), using fallback provider",
                            trace_id,
                            request.model
                        );
                    }
                    !has_available
                }
            }
            crate::proxy::ZaiDispatchMode::Pooled => {
                let total = google_accounts.saturating_add(1).max(1);
                let slot = state.provider_rr.fetch_add(1, Ordering::Relaxed) % total;
                slot == 0
            }
        }
    };

    // Clean cache_control from all messages
    clean_cache_control_from_messages(&mut request.messages);

    // Merge consecutive same-role messages
    merge_consecutive_messages(&mut request.messages);

    // Get model family for signature validation
    let target_family = if use_zai {
        Some("claude")
    } else {
        let mapped_model = crate::proxy::common::model_mapping::map_claude_model_to_gemini(&request.model);
        if mapped_model.contains("gemini") {
            Some("gemini")
        } else {
            Some("claude")
        }
    };

    // Filter invalid thinking blocks
    filter_invalid_thinking_blocks_with_family(&mut request.messages, target_family);

    // Recover from broken tool loops
    if state.experimental.read().await.enable_tool_loop_recovery {
        close_tool_loop_for_thinking(&mut request.messages);
    }

    // Intercept warmup requests
    if is_warmup_request(&request) {
        tracing::info!(
            "[{}] 🔥 Intercepting Warmup request, returning mock response (saving quota)",
            trace_id
        );
        return create_warmup_response(&request, request.stream);
    }

    if use_zai {
        // Re-serialize fixed request for z.ai
        let new_body = match serde_json::to_value(&request) {
            Ok(v) => v,
            Err(e) => {
                tracing::error!("Failed to serialize fixed request for z.ai: {}", e);
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }
        };

        return crate::proxy::providers::zai_anthropic::forward_anthropic_json(
            &state,
            axum::http::Method::POST,
            "/v1/messages",
            &headers,
            new_body,
            request.messages.len(),
        )
        .await;
    }
    
    // Google Flow
    let experimental = state.experimental.read().await;
    let scaling_enabled = experimental.enable_usage_scaling;
    let threshold_l1 = experimental.context_compression_threshold_l1;
    let threshold_l2 = experimental.context_compression_threshold_l2;
    let threshold_l3 = experimental.context_compression_threshold_l3;
    drop(experimental);

    // Get meaningful message for logging
    let meaningful_msg = request.messages.iter().rev()
        .filter(|m| m.role == "user")
        .find_map(|m| {
            let content = match &m.content {
                crate::proxy::mappers::claude::models::MessageContent::String(s) => s.to_string(),
                crate::proxy::mappers::claude::models::MessageContent::Array(arr) => {
                    arr.iter()
                        .filter_map(|block| match block {
                            crate::proxy::mappers::claude::models::ContentBlock::Text { text } => Some(text.as_str()),
                            _ => None,
                        })
                        .collect::<Vec<_>>()
                        .join(" ")
                }
            };
            
            if content.trim().is_empty() 
                || content.starts_with("Warmup") 
                || content.contains("<system-reminder>") 
            {
                None 
            } else {
                Some(content)
            }
        });

    let latest_msg = meaningful_msg.unwrap_or_else(|| {
        request.messages.last().map(|m| {
            match &m.content {
                crate::proxy::mappers::claude::models::MessageContent::String(s) => s.clone(),
                crate::proxy::mappers::claude::models::MessageContent::Array(_) => "[Complex/Tool Message]".to_string()
            }
        }).unwrap_or_else(|| "[No Messages]".to_string())
    });
    
    info!(
        "[{}] Claude Request | Model: {} | Stream: {} | Messages: {} | Tools: {}",
        trace_id,
        request.model,
        request.stream,
        request.messages.len(),
        request.tools.is_some()
    );
    
    debug!("========== [{}] CLAUDE REQUEST DEBUG START ==========", trace_id);
    debug!("[{}] Model: {}", trace_id, request.model);
    debug!("[{}] Stream: {}", trace_id, request.stream);
    debug!("[{}] Max Tokens: {:?}", trace_id, request.max_tokens);
    debug!("[{}] Temperature: {:?}", trace_id, request.temperature);
    debug!("[{}] Message Count: {}", trace_id, request.messages.len());
    debug!("[{}] Has Tools: {}", trace_id, request.tools.is_some());
    debug!("[{}] Has Thinking Config: {}", trace_id, request.thinking.is_some());
    debug!("[{}] Content Preview: {:.100}...", trace_id, latest_msg);
    
    for (idx, msg) in request.messages.iter().enumerate() {
        let content_preview = match &msg.content {
            crate::proxy::mappers::claude::models::MessageContent::String(s) => {
                let char_count = s.chars().count();
                if char_count > 200 {
                    let preview: String = s.chars().take(200).collect();
                    format!("{}... (total {} chars)", preview, char_count)
                } else {
                    s.clone()
                }
            },
            crate::proxy::mappers::claude::models::MessageContent::Array(arr) => {
                format!("[Array with {} blocks]", arr.len())
            }
        };
        debug!("[{}] Message[{}] - Role: {}, Content: {}", 
            trace_id, idx, msg.role, content_preview);
    }
    
    debug!("[{}] Full Claude Request JSON: {}", trace_id, serde_json::to_string_pretty(&request).unwrap_or_default());
    debug!("========== [{}] CLAUDE REQUEST DEBUG END ==========", trace_id);

    let _session_id: Option<&str> = None;
    let upstream = state.upstream.clone();
    let mut request_for_body = request.clone();
    let token_manager = state.token_manager;
    
    let pool_size = token_manager.len();
    let max_attempts = MAX_RETRY_ATTEMPTS.min(pool_size.saturating_add(1)).max(2);

    let mut last_error = String::new();
    let mut retried_without_thinking = false;
    let mut last_email: Option<String> = None;
    let mut last_mapped_model: Option<String> = None;
    let mut last_status = StatusCode::SERVICE_UNAVAILABLE;
    
    for attempt in 0..max_attempts {
        let mut mapped_model = crate::proxy::common::model_mapping::resolve_model_route(
            &request_for_body.model,
            &*state.custom_mapping.read().await,
        );
        last_mapped_model = Some(mapped_model.clone());
        
        let tools_val: Option<Vec<Value>> = request_for_body.tools.as_ref().map(|list| {
            list.iter().map(|t| serde_json::to_value(t).unwrap_or(json!({}))).collect()
        });

        let config = crate::proxy::mappers::common_utils::resolve_request_config(
            &request_for_body.model,
            &mapped_model,
            &tools_val,
            request.size.as_deref(),
            request.quality.as_deref()
        );

        let session_id_str = crate::proxy::session_manager::SessionManager::extract_session_id(&request_for_body);
        let session_id = Some(session_id_str.as_str());

        let force_rotate_token = attempt > 0;
        let token_lease = match token_manager.get_token(&config.request_type, force_rotate_token, session_id, &config.final_model).await {
            Ok(t) => t,
            Err(e) => {
                let safe_message = if e.contains("invalid_grant") {
                    "OAuth refresh failed (invalid_grant): refresh_token likely revoked/expired; reauthorize account(s) to restore service.".to_string()
                } else {
                    e
                };
                let headers = [
                    ("X-Mapped-Model", mapped_model.as_str()),
                ];
                 return (
                    StatusCode::SERVICE_UNAVAILABLE,
                    headers,
                    Json(json!({
                        "type": "error",
                        "error": {
                            "type": "overloaded_error",
                            "message": format!("No available accounts: {}", safe_message)
                        }
                    }))
                ).into_response();
            }
        };

        let access_token = token_lease.access_token.clone();
        let project_id = token_lease.project_id.clone();
        let email = token_lease.email.clone();

        last_email = Some(email.clone());
        info!("✓ Using account: {} (type: {})", email, config.request_type);
        
        // Background task detection
        let background_task_type = detect_background_task_type(&request_for_body);
        let mut request_with_mapped = request_for_body.clone();

        if let Some(task_type) = background_task_type {
            let virtual_model_id = select_background_model(task_type);
            let resolved_model = crate::proxy::common::model_mapping::resolve_model_route(
                virtual_model_id, 
                &*state.custom_mapping.read().await
            );

            info!(
                "[{}][AUTO] Detected background task (type: {:?}), route redirect: {} -> {} (final physical model: {})",
                trace_id,
                task_type,
                mapped_model,
                virtual_model_id,
                resolved_model
            );
            
            mapped_model = resolved_model.clone();
            request_with_mapped.model = resolved_model;
            request_with_mapped.tools = None;
            request_with_mapped.thinking = None;
            
            crate::proxy::mappers::context_manager::ContextManager::purify_history(
                &mut request_with_mapped.messages, 
                crate::proxy::mappers::context_manager::PurificationStrategy::Aggressive
            );
        }

        // 3-Layer Progressive Compression
        let mut is_purified = false;
        let mut compression_applied = false;
        
        if !retried_without_thinking && scaling_enabled {
            let context_limit = if mapped_model.contains("flash") {
                1_000_000
            } else {
                2_000_000
            };

            let raw_estimated = ContextManager::estimate_token_usage(&request_with_mapped);
            let calibrator = get_calibrator();
            let mut estimated_usage = calibrator.calibrate(raw_estimated);
            let mut usage_ratio = estimated_usage as f32 / context_limit as f32;
            
            info!(
                "[{}] [ContextManager] Context pressure: {:.1}% (raw: {}, calibrated: {} / {}), Calibration factor: {:.2}",
                trace_id, usage_ratio * 100.0, raw_estimated, estimated_usage, context_limit, calibrator.get_factor()
            );

            // Layer 1: Tool Message Trimming
            if usage_ratio > threshold_l1 && !compression_applied {
                if ContextManager::trim_tool_messages(&mut request_with_mapped.messages, 5) {
                    info!(
                        "[{}] [Layer-1] Tool trimming triggered (usage: {:.1}%, threshold: {:.1}%)",
                        trace_id, usage_ratio * 100.0, threshold_l1 * 100.0
                    );
                    compression_applied = true;
                    
                    let new_raw = ContextManager::estimate_token_usage(&request_with_mapped);
                    let new_usage = calibrator.calibrate(new_raw);
                    let new_ratio = new_usage as f32 / context_limit as f32;
                    
                    info!(
                        "[{}] [Layer-1] Compression result: {:.1}% → {:.1}% (saved {} tokens)",
                        trace_id, usage_ratio * 100.0, new_ratio * 100.0, estimated_usage - new_usage
                    );
                    
                    if new_ratio < 0.7 {
                        estimated_usage = new_usage;
                        usage_ratio = new_ratio;
                    } else {
                        usage_ratio = new_ratio;
                        compression_applied = false;
                    }
                }
            }

            // Layer 2: Thinking Content Compression
            if usage_ratio > threshold_l2 && !compression_applied {
                info!(
                    "[{}] [Layer-2] Thinking compression triggered (usage: {:.1}%, threshold: {:.1}%)",
                    trace_id, usage_ratio * 100.0, threshold_l2 * 100.0
                );
                
                if ContextManager::compress_thinking_preserve_signature(
                    &mut request_with_mapped.messages, 
                    4
                ) {
                    is_purified = true;
                    compression_applied = true;
                    
                    let new_raw = ContextManager::estimate_token_usage(&request_with_mapped);
                    let new_usage = calibrator.calibrate(new_raw);
                    let new_ratio = new_usage as f32 / context_limit as f32;
                    
                    info!(
                        "[{}] [Layer-2] Compression result: {:.1}% → {:.1}% (saved {} tokens)",
                        trace_id, usage_ratio * 100.0, new_ratio * 100.0, estimated_usage - new_usage
                    );
                    
                    usage_ratio = new_ratio;
                }
            }

            // Layer 3: Fork Conversation + XML Summary
            if usage_ratio > threshold_l3 && !compression_applied {
                info!(
                    "[{}] [Layer-3] Context pressure ({:.1}%) exceeded threshold ({:.1}%), attempting Fork+Summary",
                    trace_id, usage_ratio * 100.0, threshold_l3 * 100.0
                );
                
                let token_manager_clone = token_manager.clone();
                
                match try_compress_with_summary(&request_with_mapped, &trace_id, &token_manager_clone).await {
                    Ok(forked_request) => {
                        info!(
                            "[{}] [Layer-3] Fork successful: {} → {} messages",
                            trace_id,
                            request_with_mapped.messages.len(),
                            forked_request.messages.len()
                        );
                        
                        request_with_mapped = forked_request;
                        is_purified = false;
                        
                        let new_raw = ContextManager::estimate_token_usage(&request_with_mapped);
                        let new_usage = calibrator.calibrate(new_raw);
                        let new_ratio = new_usage as f32 / context_limit as f32;
                        
                        info!(
                            "[{}] [Layer-3] Compression result: {:.1}% → {:.1}% (saved {} tokens)",
                            trace_id, usage_ratio * 100.0, new_ratio * 100.0, estimated_usage - new_usage
                        );
                    }
                    Err(e) => {
                        error!(
                            "[{}] [Layer-3] Fork+Summary failed: {}, falling back to error response",
                            trace_id, e
                        );
                        
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(json!({
                                "type": "error",
                                "error": {
                                    "type": "invalid_request_error",
                                    "message": format!("Context too long and automatic compression failed: {}", e),
                                    "suggestion": "Please use /compact or /clear command in Claude Code, or switch to a model with larger context window."
                                }
                            }))
                        ).into_response();
                    }
                }
            }
        }

        let raw_estimated = if !is_purified {
            ContextManager::estimate_token_usage(&request_with_mapped)
        } else {
            0
        };

        request_with_mapped.model = mapped_model;

        let gemini_body = match transform_claude_request_in(&request_with_mapped, &project_id, retried_without_thinking) {
            Ok(b) => {
                debug!("[{}] Transformed Gemini Body: {}", trace_id, serde_json::to_string_pretty(&b).unwrap_or_default());
                b
            },
            Err(e) => {
                 let headers = [
                    ("X-Mapped-Model", request_with_mapped.model.as_str()),
                    ("X-Account-Email", email.as_str()),
                ];
                 return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    headers,
                    Json(json!({
                        "type": "error",
                        "error": {
                            "type": "api_error",
                            "message": format!("Transform error: {}", e)
                        }
                    }))
                ).into_response();
            }
        };

        if debug_logger::is_enabled(&debug_cfg) {
            let payload = json!({
                "kind": "v1internal_request",
                "protocol": "anthropic",
                "trace_id": trace_id,
                "original_model": request.model,
                "mapped_model": request_with_mapped.model,
                "request_type": config.request_type,
                "attempt": attempt,
                "v1internal_request": gemini_body.clone(),
            });
            debug_logger::write_debug_payload(&debug_cfg, Some(&trace_id), "v1internal_request", &payload).await;
        }
        
        // Upstream call - auto-conversion logic
        let client_wants_stream = request.stream;
        let force_stream_internally = !client_wants_stream;
        let actual_stream = client_wants_stream || force_stream_internally;
        
        if force_stream_internally {
            info!("[{}] 🔄 Auto-converting non-stream request to stream for better quota", trace_id);
        }
        
        let method = if actual_stream { "streamGenerateContent" } else { "generateContent" };
        let query = if actual_stream { Some("alt=sse") } else { None };

        let mut extra_headers = std::collections::HashMap::new();
        if request_with_mapped.thinking.is_some() && request_with_mapped.tools.is_some() {
            extra_headers.insert("anthropic-beta".to_string(), "interleaved-thinking-2025-05-14".to_string());
            tracing::debug!("[{}] Added Beta Header: interleaved-thinking-2025-05-14", trace_id);
        }

        let response = match upstream
            .call_v1_internal_with_headers(method, &access_token, gemini_body, query, extra_headers.clone())
            .await {
            Ok(r) => r,
            Err(e) => {
                last_error = e.clone();
                debug!("Request failed on attempt {}/{}: {}", attempt + 1, max_attempts, e);
                continue;
            }
        };
        
        let status = response.status();
        last_status = status;
        
        if status.is_success() {
            token_manager.mark_account_success(&email, Some(&request_with_mapped.model));
            let context_limit = crate::proxy::mappers::claude::utils::get_context_limit_for_model(&request_with_mapped.model);

            if actual_stream {
                let meta = json!({
                    "protocol": "anthropic",
                    "trace_id": trace_id,
                    "original_model": request.model,
                    "mapped_model": request_with_mapped.model,
                    "request_type": config.request_type,
                    "attempt": attempt,
                    "status": status.as_u16(),
                });
                let gemini_stream = debug_logger::wrap_reqwest_stream_with_debug(
                    Box::pin(response.bytes_stream()),
                    debug_cfg.clone(),
                    trace_id.clone(),
                    "upstream_response",
                    meta,
                );

                let current_message_count = request_with_mapped.messages.len();

                let mut claude_stream = create_claude_sse_stream(
                    gemini_stream,
                    trace_id.clone(),
                    email.clone(),
                    Some(session_id_str.clone()),
                    scaling_enabled,
                    context_limit,
                    Some(raw_estimated),
                    current_message_count,
                );

                let mut first_data_chunk = None;
                let mut retry_this_account = false;

                loop {
                    match tokio::time::timeout(std::time::Duration::from_secs(60), claude_stream.next()).await {
                        Ok(Some(Ok(bytes))) => {
                            if bytes.is_empty() {
                                continue;
                            }
                            
                            let text = String::from_utf8_lossy(&bytes);
                            if text.trim().starts_with(":") {
                                debug!("[{}] Skipping peek heartbeat: {}", trace_id, text.trim());
                                continue;
                            }

                            first_data_chunk = Some(bytes);
                            break;
                        }
                        Ok(Some(Err(e))) => {
                            tracing::warn!("[{}] Stream error during peek: {}, retrying...", trace_id, e);
                            last_error = format!("Stream error during peek: {}", e);
                            retry_this_account = true;
                            break;
                        }
                        Ok(None) => {
                            tracing::warn!("[{}] Stream ended during peek (Empty Response), retrying...", trace_id);
                            last_error = "Empty response stream during peek".to_string();
                            retry_this_account = true;
                            break;
                        }
                        Err(_) => {
                            tracing::warn!("[{}] Timeout waiting for first data (60s), retrying...", trace_id);
                            last_error = "Timeout waiting for first data".to_string();
                            retry_this_account = true;
                            break;
                        }
                    }
                }

                if retry_this_account {
                    continue;
                }

                match first_data_chunk {
                    Some(bytes) => {
                        let stream_rest = claude_stream;
                        let combined_stream = Box::pin(futures::stream::once(async move { Ok(bytes) })
                            .chain(stream_rest.map(|result| -> Result<Bytes, std::io::Error> {
                                match result {
                                    Ok(b) => Ok(b),
                                    Err(e) => Ok(Bytes::from(format!("data: {{\"error\":\"{}\"}}\n\n", e))),
                                }
                            })));

                        if client_wants_stream {
                            return Response::builder()
                                .status(StatusCode::OK)
                                .header(header::CONTENT_TYPE, "text/event-stream")
                                .header(header::CACHE_CONTROL, "no-cache")
                                .header(header::CONNECTION, "keep-alive")
                                .header("X-Accel-Buffering", "no")
                                .header("X-Account-Email", &email)
                                .header("X-Mapped-Model", &request_with_mapped.model)
                                .header("X-Context-Purified", if is_purified { "true" } else { "false" })
                                .body(Body::from_stream(combined_stream))
                                .unwrap();
                        } else {
                            use crate::proxy::mappers::claude::collect_stream_to_json;
                            
                            match collect_stream_to_json(combined_stream).await {
                                Ok(full_response) => {
                                    info!("[{}] ✓ Stream collected and converted to JSON", trace_id);
                                    return Response::builder()
                                        .status(StatusCode::OK)
                                        .header(header::CONTENT_TYPE, "application/json")
                                        .header("X-Account-Email", &email)
                                        .header("X-Mapped-Model", &request_with_mapped.model)
                                        .header("X-Context-Purified", if is_purified { "true" } else { "false" })
                                        .body(Body::from(serde_json::to_string(&full_response).unwrap()))
                                        .unwrap();
                                }
                                Err(e) => {
                                    return (StatusCode::INTERNAL_SERVER_ERROR, format!("Stream collection error: {}", e)).into_response();
                                }
                            }
                        }
                    },

                    None => {
                        tracing::warn!("[{}] Stream ended immediately (Empty Response), retrying...", trace_id);
                        last_error = "Empty response stream (None)".to_string();
                        continue;
                    }
                }
            } else {
                // Non-streaming response
                let bytes = match response.bytes().await {
                    Ok(b) => b,
                    Err(e) => return (StatusCode::BAD_GATEWAY, format!("Failed to read body: {}", e)).into_response(),
                };
                
                if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                    debug!("Upstream Response for Claude request: {}", text);
                }

                let gemini_resp: Value = match serde_json::from_slice(&bytes) {
                    Ok(v) => v,
                    Err(e) => return (StatusCode::BAD_GATEWAY, format!("Parse error: {}", e)).into_response(),
                };

                let raw = gemini_resp.get("response").unwrap_or(&gemini_resp);

                let gemini_response: crate::proxy::mappers::claude::models::GeminiResponse = match serde_json::from_value(raw.clone()) {
                    Ok(r) => r,
                    Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, format!("Convert error: {}", e)).into_response(),
                };
                
                let context_limit = crate::proxy::mappers::claude::utils::get_context_limit_for_model(&request_with_mapped.model);
                let s_id_owned = session_id.map(|s| s.to_string());
                
                let claude_response = match transform_response(
                    &gemini_response,
                    scaling_enabled,
                    context_limit,
                    s_id_owned,
                    request_with_mapped.model.clone(),
                    request_with_mapped.messages.len(),
                ) {
                    Ok(r) => r,
                    Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, format!("Transform error: {}", e)).into_response(),
                };

                let cache_info = if let Some(cached) = claude_response.usage.cache_read_input_tokens {
                    format!(", Cached: {}", cached)
                } else {
                    String::new()
                };
                
                tracing::info!(
                    "[{}] Request finished. Model: {}, Tokens: In {}, Out {}{}", 
                    trace_id, 
                    request_with_mapped.model, 
                    claude_response.usage.input_tokens, 
                    claude_response.usage.output_tokens,
                    cache_info
                );

                return (StatusCode::OK, [("X-Account-Email", email.as_str()), ("X-Mapped-Model", request_with_mapped.model.as_str())], Json(claude_response)).into_response();
            }
        }
        
        // Error handling
        let status_code = status.as_u16();
        last_status = status;
        let retry_after = response.headers().get("Retry-After").and_then(|h| h.to_str().ok()).map(|s| s.to_string());
        
        let error_text = response.text().await.unwrap_or_else(|_| format!("HTTP {}", status));
        last_error = format!("HTTP {}: {}", status_code, error_text);
        debug!("[{}] Upstream Error Response: {}", trace_id, error_text);
        
        if debug_logger::is_enabled(&debug_cfg) {
            let payload = json!({
                "kind": "upstream_response_error",
                "protocol": "anthropic",
                "trace_id": trace_id,
                "original_model": request.model,
                "mapped_model": request_with_mapped.model,
                "request_type": config.request_type,
                "attempt": attempt,
                "status": status_code,
                "error_text": error_text,
            });
            debug_logger::write_debug_payload(&debug_cfg, Some(&trace_id), "upstream_response_error", &payload).await;
        }
        
        if status_code == 429 || status_code == 529 || status_code == 503 || status_code == 500 {
            token_manager.mark_rate_limited_async(&email, status_code, retry_after.as_deref(), &error_text, Some(&request_with_mapped.model)).await;
        }

        if status_code == 402 || status_code == 429 || status_code == 401 {
             token_manager.report_account_failure(&token_lease.account_id, status_code, &error_text);
        }

        if status_code == 403 && (
            error_text.contains("VALIDATION_REQUIRED") || 
            error_text.contains("verify your account") ||
            error_text.contains("validation_url")
        ) {
            tracing::warn!(
                "[Claude] VALIDATION_REQUIRED detected on account {}, temporarily blocking",
                email
            );
            let block_minutes = 10i64;
            let block_until = chrono::Utc::now().timestamp() + (block_minutes * 60);
            
            if let Err(e) = token_manager.set_validation_block_public(&token_lease.account_id, block_until, &error_text).await {
                tracing::error!("Failed to set validation block: {}", e);
            }
        }

        // Handle 400 error (Thinking signature failure)
        if status_code == 400
            && !retried_without_thinking
            && (error_text.contains("Invalid `signature`")
                || error_text.contains("thinking.signature: Field required")
                || error_text.contains("thinking.thinking: Field required")
                || error_text.contains("thinking.signature")
                || error_text.contains("thinking.thinking")
                || error_text.contains("Corrupted thought signature")
                || error_text.contains("failed to deserialise")
                || error_text.contains("Invalid signature")
                || error_text.contains("thinking block")
                || error_text.contains("Found `text`")
                || error_text.contains("Found 'text'")
                || error_text.contains("must be `thinking`")
                || error_text.contains("must be 'thinking'")
                )
        {
            retried_without_thinking = true;
            
            tracing::warn!(
                "[{}] Unexpected thinking signature error (should have been filtered). \
                 Retrying with all thinking blocks removed.",
                trace_id
            );

            if let Some(last_msg) = request_for_body.messages.last_mut() {
                if last_msg.role == "user" {
                    let repair_prompt = "\n\n[System Recovery] Your previous output contained an invalid signature. Please regenerate the response without the corrupted signature block.";
                    
                    match &mut last_msg.content {
                        crate::proxy::mappers::claude::models::MessageContent::String(s) => {
                            s.push_str(repair_prompt);
                        }
                        crate::proxy::mappers::claude::models::MessageContent::Array(blocks) => {
                            blocks.push(crate::proxy::mappers::claude::models::ContentBlock::Text {
                                text: repair_prompt.to_string(),
                            });
                        }
                    }
                    tracing::debug!("[{}] Appended repair prompt to last user message", trace_id);
                }
            }

            for msg in request_for_body.messages.iter_mut() {
                if let crate::proxy::mappers::claude::models::MessageContent::Array(blocks) = &mut msg.content {
                    let mut new_blocks = Vec::with_capacity(blocks.len());
                    for block in blocks.drain(..) {
                        match block {
                            crate::proxy::mappers::claude::models::ContentBlock::Thinking { thinking, .. } => {
                                if !thinking.is_empty() {
                                    tracing::debug!("[Fallback] Converting thinking block to text (len={})", thinking.len());
                                    new_blocks.push(crate::proxy::mappers::claude::models::ContentBlock::Text { 
                                        text: thinking 
                                    });
                                }
                            },
                            crate::proxy::mappers::claude::models::ContentBlock::RedactedThinking { .. } => {
                                // Discard redacted thinking
                            },
                            _ => new_blocks.push(block),
                        }
                    }
                    *blocks = new_blocks;
                }
            }
            
            crate::proxy::mappers::claude::thinking_utils::close_tool_loop_for_thinking(&mut request_for_body.messages);
            
            if request_for_body.model.contains("claude-") {
                let mut m = request_for_body.model.clone();
                m = m.replace("-thinking", "");
                if m.contains("claude-sonnet-4-5-") {
                    m = "claude-sonnet-4-5".to_string();
                } else if m.contains("claude-opus-4-5-") || m.contains("claude-opus-4-") {
                    m = "claude-opus-4-5".to_string();
                }
                request_for_body.model = m;
            }
            
            if apply_retry_strategy(
                RetryStrategy::FixedDelay(Duration::from_millis(200)), 
                attempt, 
                max_attempts,
                status_code, 
                &trace_id
            ).await {
                continue;
            }
        }

        let strategy = determine_retry_strategy(status_code, &error_text, retried_without_thinking);
        
        if apply_retry_strategy(strategy, attempt, max_attempts, status_code, &trace_id).await {
            if status_code == 429 {
                token_manager.report_429_penalty(&token_lease.account_id);
            }

            if !should_rotate_account(status_code) {
                debug!("[{}] Keeping same account for status {} (server-side issue)", trace_id, status_code);
            }
            continue;
        } else {
            if status_code == 400 && (error_text.contains("too long") || error_text.contains("exceeds") || error_text.contains("limit")) {
                 return (
                    StatusCode::BAD_REQUEST,
                    [("X-Account-Email", email.as_str())],
                    Json(json!({
                        "id": "err_prompt_too_long",
                        "type": "error",
                        "error": {
                            "type": "invalid_request_error",
                            "message": "Prompt is too long (server-side context limit reached).",
                            "suggestion": "Please: 1) Executive '/compact' in Claude Code 2) Reduce conversation history 3) Switch to gemini-1.5-pro (2M context limit)"
                        }
                    }))
                ).into_response();
            }

            error!("[{}] Non-retryable error {}: {}", trace_id, status_code, error_text);
            return (status, [("X-Account-Email", email.as_str())], error_text).into_response();
        }
    }
    
    if let Some(email) = last_email {
        let mut headers = HeaderMap::new();
        headers.insert("X-Account-Email", header::HeaderValue::from_str(&email).unwrap());
        if let Some(model) = last_mapped_model {
             if let Ok(v) = header::HeaderValue::from_str(&model) {
                headers.insert("X-Mapped-Model", v);
             }
        }

        let error_type = match last_status.as_u16() {
            400 => "invalid_request_error",
            401 => "authentication_error",
            403 => "permission_error",
            429 => "rate_limit_error",
            529 => "overloaded_error",
            _ => "api_error",
        };

        (last_status, headers, Json(json!({
            "type": "error",
            "error": {
                "id": "err_retry_exhausted",
                "type": error_type,
                "message": format!("All {} attempts failed. Last status: {}. Error: {}", max_attempts, last_status, last_error)
            }
        }))).into_response()
    } else {
        let mut headers = HeaderMap::new();
        if let Some(model) = last_mapped_model {
             if let Ok(v) = header::HeaderValue::from_str(&model) {
                headers.insert("X-Mapped-Model", v);
             }
        }
        
        let error_type = match last_status.as_u16() {
            400 => "invalid_request_error",
            401 => "authentication_error",
            403 => "permission_error",
            429 => "rate_limit_error",
            529 => "overloaded_error",
            _ => "api_error",
        };

        (last_status, headers, Json(json!({
            "type": "error",
            "error": {
                "id": "err_retry_exhausted",
                "type": error_type,
                "message": format!("All {} attempts failed. Last status: {}. Error: {}", max_attempts, last_status, last_error)
            }
        }))).into_response()
    }
}
