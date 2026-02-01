// Claude Request Transformation Module
// Converts Claude requests to Gemini v1internal format

mod cleanup;
mod contents;
mod generation;
mod safety;
mod sorting;
mod system;
mod thinking;
mod tools;
mod transform;

// Re-export main transformation function
pub use transform::transform_claude_request_in;

// Re-export cleanup utilities (used by handlers)
pub use cleanup::{clean_cache_control_from_messages, clean_thinking_fields_recursive};

// Re-export sorting utilities (used by handlers)
pub use sorting::merge_consecutive_messages;

// Internal re-exports for use within this module
pub(crate) use cleanup::deep_clean_cache_control;
pub(crate) use contents::{build_contents, build_google_contents};
pub(crate) use generation::build_generation_config;
pub(crate) use safety::build_safety_settings;
pub(crate) use sorting::{reorder_gemini_parts, sort_thinking_blocks_first};
pub(crate) use system::build_system_instruction;
pub(crate) use thinking::{
    has_valid_signature_for_function_calls, is_model_compatible, should_disable_thinking_due_to_history,
    should_enable_thinking_by_default, MIN_SIGNATURE_LENGTH,
};
pub(crate) use tools::build_tools;

#[cfg(test)]
mod tests;
