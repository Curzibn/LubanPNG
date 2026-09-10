use crate::repositories::rate_limit_repository::RateLimitRepository;
use crate::repositories::task_repository::TaskRepository;
use crate::services::compression::CompressionService;
use chrono::{Duration, Utc};
use std::sync::Arc;
use tokio::task::JoinHandle;
use tokio::time::{sleep, Duration as StdDuration};

pub fn spawn_workers(
    service: Arc<CompressionService>,
    tasks: Arc<TaskRepository>,
    rate_limits: Arc<RateLimitRepository>,
    worker_count: usize,
    stale_secs: i64,
) -> Vec<JoinHandle<()>> {
    let instance = uuid::Uuid::new_v4().to_string();
    let mut handles = Vec::with_capacity(worker_count + 1);
    for index in 0..worker_count.max(1) {
        let worker_id = format!("{}-{}", instance, index);
        let service = service.clone();
        let tasks = tasks.clone();
        handles.push(tokio::spawn(async move {
            loop {
                match tasks.claim_next(&worker_id).await {
                    Ok(Some(task)) => service.process(task).await,
                    Ok(None) => sleep(StdDuration::from_millis(400)).await,
                    Err(err) => {
                        tracing::warn!(worker = %worker_id, error = %err, "claiming task failed");
                        sleep(StdDuration::from_secs(2)).await;
                    }
                }
            }
        }));
    }
    handles.push(tokio::spawn(async move {
        loop {
            sleep(StdDuration::from_secs(60)).await;
            match tasks
                .requeue_stale(Utc::now() - Duration::seconds(stale_secs))
                .await
            {
                Ok(0) => {}
                Ok(count) => tracing::warn!(count, "requeued stale processing tasks"),
                Err(err) => tracing::warn!(error = %err, "requeue of stale tasks failed"),
            }
            if let Err(err) = rate_limits.cleanup().await {
                tracing::warn!(error = %err, "rate limit cleanup failed");
            }
        }
    }));
    handles
}
