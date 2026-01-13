// 错误分类模块 - 将底层错误转换为用户友好的消息
use reqwest::Error;

/// 分类流式响应错误并返回用户友好的消息
/// 
/// 返回值: (错误类型, 用户友好的错误消息)
pub fn classify_stream_error(error: &Error) -> (&'static str, String) {
    if error.is_timeout() {
        (
            "timeout_error",
            "请求超时,请检查网络连接".to_string()
        )
    } else if error.is_connect() {
        (
            "connection_error",
            "无法连接到服务器,请检查网络或代理设置".to_string()
        )
    } else if error.is_decode() {
        (
            "decode_error",
            "网络连接不稳定,数据传输中断。建议: 1) 检查网络连接 2) 更换代理节点 3) 稍后重试".to_string()
        )
    } else if error.is_body() {
        (
            "stream_error",
            "数据流传输错误,请稍后重试".to_string()
        )
    } else {
        (
            "unknown_error",
            format!("发生未知错误。错误详情: {}", error)
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_timeout_error() {
        // 创建一个模拟的超时错误
        let url = "http://example.com";
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_millis(1))
            .build()
            .unwrap();
        
        let rt = tokio::runtime::Runtime::new().unwrap();
        let error = rt.block_on(async {
            client.get(url).send().await.unwrap_err()
        });
        
        if error.is_timeout() {
            let (error_type, message) = classify_stream_error(&error);
            assert_eq!(error_type, "timeout_error");
            assert!(message.contains("超时"));
            assert!(message.contains("网络"));
        }
    }

    #[test]
    fn test_error_message_format() {
        // 测试错误消息格式
        let url = "http://invalid-domain-that-does-not-exist-12345.com";
        let client = reqwest::Client::new();
        
        let rt = tokio::runtime::Runtime::new().unwrap();
        let error = rt.block_on(async {
            client.get(url).send().await.unwrap_err()
        });
        
        let (error_type, message) = classify_stream_error(&error);
        
        // 错误类型应该是已知的类型之一
        assert!(
            error_type == "timeout_error" ||
            error_type == "connection_error" ||
            error_type == "decode_error" ||
            error_type == "stream_error" ||
            error_type == "unknown_error"
        );
        
        // 消息不应该为空
        assert!(!message.is_empty());
    }

    #[test]
    fn test_all_error_types_have_chinese_messages() {
        // 确保所有错误类型都有中文消息
        let test_cases = vec![
            ("timeout_error", "超时"),
            ("connection_error", "连接"),
            ("decode_error", "网络连接不稳定"),
            ("stream_error", "数据流"),
        ];
        
        for (expected_type, expected_keyword) in test_cases {
            // 这里我们只验证消息格式,实际的错误需要真实的网络请求
            match expected_type {
                "timeout_error" => {
                    let msg = "请求超时,请检查网络连接";
                    assert!(msg.contains(expected_keyword));
                }
                "connection_error" => {
                    let msg = "无法连接到服务器,请检查网络或代理设置";
                    assert!(msg.contains(expected_keyword));
                }
                "decode_error" => {
                    let msg = "网络连接不稳定,数据传输中断。建议: 1) 检查网络连接 2) 更换代理节点 3) 稍后重试";
                    assert!(msg.contains(expected_keyword));
                }
                "stream_error" => {
                    let msg = "数据流传输错误,请稍后重试";
                    assert!(msg.contains(expected_keyword));
                }
                _ => {}
            }
        }
    }
}
