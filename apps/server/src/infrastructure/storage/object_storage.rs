use crate::config::StorageConfig;
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use axum::http::Method;
use bytes::Bytes;
use object_store::aws::{AmazonS3, AmazonS3Builder};
use object_store::path::Path;
use object_store::signer::Signer;
use object_store::{Attribute, Attributes, ObjectStore, ObjectStoreExt, PutOptions, PutPayload};
use std::time::Duration;

#[async_trait]
pub trait ObjectStorage: Send + Sync {
    async fn put(
        &self,
        key: &str,
        data: Bytes,
        content_type: &str,
        download_name: Option<&str>,
    ) -> AppResult<()>;
    async fn get(&self, key: &str) -> AppResult<Bytes>;
    async fn delete(&self, key: &str) -> AppResult<()>;
    async fn presigned_get_url(&self, key: &str, ttl: Duration) -> AppResult<String>;
}

pub struct S3Storage {
    internal: AmazonS3,
    public: AmazonS3,
}

impl S3Storage {
    pub fn from_config(config: &StorageConfig) -> AppResult<Self> {
        Ok(Self {
            internal: build_client(config, &config.endpoint)?,
            public: build_client(config, config.public_endpoint_or_internal())?,
        })
    }
}

fn build_client(config: &StorageConfig, endpoint: &str) -> AppResult<AmazonS3> {
    AmazonS3Builder::new()
        .with_endpoint(endpoint)
        .with_bucket_name(&config.bucket)
        .with_access_key_id(&config.access_key)
        .with_secret_access_key(&config.secret_key)
        .with_region(&config.region)
        .with_allow_http(true)
        .with_virtual_hosted_style_request(false)
        .build()
        .map_err(AppError::from)
}

fn content_disposition(download_name: &str) -> String {
    let ascii: String = download_name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let encoded: String = download_name
        .bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_') {
                (b as char).to_string()
            } else {
                format!("%{:02X}", b)
            }
        })
        .collect();
    format!(
        "attachment; filename=\"{}\"; filename*=UTF-8''{}",
        ascii, encoded
    )
}

#[async_trait]
impl ObjectStorage for S3Storage {
    async fn put(
        &self,
        key: &str,
        data: Bytes,
        content_type: &str,
        download_name: Option<&str>,
    ) -> AppResult<()> {
        let mut attributes = Attributes::new();
        attributes.insert(Attribute::ContentType, content_type.to_string().into());
        if let Some(name) = download_name {
            attributes.insert(
                Attribute::ContentDisposition,
                content_disposition(name).into(),
            );
        }
        self.internal
            .put_opts(
                &Path::from(key),
                PutPayload::from(data),
                PutOptions {
                    attributes,
                    ..Default::default()
                },
            )
            .await?;
        Ok(())
    }

    async fn get(&self, key: &str) -> AppResult<Bytes> {
        let result = self.internal.get(&Path::from(key)).await?;
        Ok(result.bytes().await?)
    }

    async fn delete(&self, key: &str) -> AppResult<()> {
        self.internal.delete(&Path::from(key)).await?;
        Ok(())
    }

    async fn presigned_get_url(&self, key: &str, ttl: Duration) -> AppResult<String> {
        let url = self
            .public
            .signed_url(Method::GET, &Path::from(key), ttl)
            .await?;
        Ok(url.to_string())
    }
}
