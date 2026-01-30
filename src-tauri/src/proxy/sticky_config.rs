use serde::{Deserialize, Serialize};

/// 调度模式枚举
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum SchedulingMode {
    /// 缓存优先 (Cache-first): 尽可能锁定同一账号，限流时优先等待，极大提升 Prompt Caching 命中率
    CacheFirst,
    /// 平衡模式 (Balance): 锁定同一账号，限流时立即切换到备选账号，兼顾成功率和性能
    Balance,
    /// 性能优先 (Performance-first): 纯轮询模式 (Round-robin)，账号负载最均衡，但不利用缓存
    PerformanceFirst,
    /// 指定账号 (Selected): 仅在指定的账号列表中进行负载均衡 [NEW]
    Selected,
}

impl Default for SchedulingMode {
    fn default() -> Self {
        Self::Balance
    }
}

/// 粘性会话配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct StickySessionConfig {
    /// 当前调度模式
    pub mode: SchedulingMode,
    /// 缓存优先模式下的最大等待时间 (秒)
    pub max_wait_seconds: u64,
    /// 指定模式下使用的账号 ID 列表 [NEW]
    pub selected_accounts: Vec<String>,
    /// 指定模式下每个账号允许的模型列表 (AccountID -> [Model Names]) [NEW]
    #[serde(default)]
    pub selected_models: std::collections::HashMap<String, Vec<String>>,
}

impl Default for StickySessionConfig {
    fn default() -> Self {
        Self {
            mode: SchedulingMode::Balance,
            max_wait_seconds: 60,
            selected_accounts: Vec::new(),
            selected_models: std::collections::HashMap::new(),
        }
    }
}
