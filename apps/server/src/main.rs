use lubanpng::app::{build_router, build_state, start_workers};
use lubanpng::config::AppConfig;
use lubanpng::infrastructure::db;
use lubanpng::infrastructure::mail::{DisabledMailer, Mailer, SmtpMailer};
use lubanpng::infrastructure::storage::{ObjectStorage, S3Storage};
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let config = AppConfig::load().expect("加载配置失败");
    let pool = db::connect(&config.database).await.expect("连接数据库失败");
    let storage: Arc<dyn ObjectStorage> =
        Arc::new(S3Storage::from_config(&config.storage).expect("对象存储配置无效"));
    let mailer: Arc<dyn Mailer> = if config.mail.enabled() {
        Arc::new(SmtpMailer::from_config(&config.mail).expect("邮件配置无效"))
    } else {
        tracing::warn!("SMTP 未配置，验证码登录不可用");
        Arc::new(DisabledMailer)
    };

    let worker_count = config.server.max_concurrent_tasks;
    let bind_addr = format!("{}:{}", config.server.host, config.server.port);
    let state = build_state(config, pool, storage, mailer);
    let _workers = start_workers(&state, worker_count);
    tracing::info!(workers = worker_count, "worker pool started");

    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .expect("绑定端口失败");
    tracing::info!(addr = %bind_addr, "server listening");
    axum::serve(listener, build_router(state))
        .await
        .expect("服务器启动失败");
}
