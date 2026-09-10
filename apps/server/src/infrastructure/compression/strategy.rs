use crate::config::AppConfig;
use crate::domain::compression::CompressionResult;
use crate::error::AppResult;
use async_trait::async_trait;

#[async_trait]
pub trait CompressionStrategy: Send + Sync {
    async fn compress(
        &self,
        input: &[u8],
        config: &AppConfig,
    ) -> AppResult<CompressionResult>;
}
