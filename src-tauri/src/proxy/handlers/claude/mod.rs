// Claude API Handlers Module
// Handles Anthropic Claude-compatible API endpoints

mod background;
mod compression;
mod messages;
mod models;
mod tokens;
mod warmup;

// Re-export all public handlers
pub use messages::handle_messages;
pub use models::handle_list_models;
pub use tokens::handle_count_tokens;

// Re-export internal utilities for use within the module
pub(crate) use background::{detect_background_task_type, select_background_model, BackgroundTaskType};
pub(crate) use compression::{try_compress_with_summary, CONTEXT_SUMMARY_PROMPT};
pub(crate) use warmup::{create_warmup_response, is_warmup_request};
