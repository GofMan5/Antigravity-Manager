// Proxy Commands Module
// Organized into logical submodules for maintainability

mod types;
mod lifecycle;
mod status;
mod logs;
mod config;
mod external;
mod accounts;

// Re-export types
pub use types::{ProxyStatus, ProxyServiceState, ProxyServiceInstance, AdminServerInstance};

// Re-export lifecycle commands
pub use lifecycle::{start_proxy_service, stop_proxy_service, internal_start_proxy_service, ensure_admin_server};

// Re-export status commands
pub use status::{get_proxy_status, get_proxy_stats, get_proxy_logs, set_proxy_monitor_enabled, clear_proxy_logs};

// Re-export logs commands
pub use logs::{
    get_proxy_logs_paginated, get_proxy_log_detail, get_proxy_logs_count,
    export_proxy_logs, export_proxy_logs_json,
    get_proxy_logs_count_filtered, get_proxy_logs_filtered
};

// Re-export config commands
pub use config::{generate_api_key, update_model_mapping, get_proxy_scheduling_config, update_proxy_scheduling_config};

// Re-export external commands
pub use external::fetch_zai_models;

// Re-export account commands
pub use accounts::{
    reload_proxy_accounts, clear_proxy_session_bindings,
    set_preferred_account, get_preferred_account,
    clear_proxy_rate_limit, clear_all_proxy_rate_limits
};
