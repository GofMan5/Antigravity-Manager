use std::sync::LazyLock;

/// Shared User-Agent string for all upstream API requests.
pub static USER_AGENT: LazyLock<String> =
    LazyLock::new(|| "antigravity/1.15.8 windows/amd64".to_string());

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_agent_format() {
        assert_eq!(USER_AGENT.as_str(), "antigravity/1.15.8 windows/amd64");
    }
}
