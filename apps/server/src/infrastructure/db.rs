use crate::config::DatabaseConfig;
use crate::error::{AppError, AppResult};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

pub async fn connect(config: &DatabaseConfig) -> AppResult<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(config.max_connections)
        .connect(&config.url)
        .await?;
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|e| AppError::internal(format!("数据库迁移失败: {}", e)))?;
    Ok(pool)
}
