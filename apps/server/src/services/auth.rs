use crate::config::{AuthConfig, LimitsConfig};
use crate::domain::subject::{Plan, Source, Subject, SubjectKind};
use crate::error::{AppError, AppResult};
use crate::infrastructure::mail::Mailer;
use crate::repositories::identity_repository::{AccountRow, ApiKeyRow, IdentityRepository};
use crate::repositories::rate_limit_repository::RateLimitRepository;
use axum::http::header::{AUTHORIZATION, COOKIE, USER_AGENT};
use axum::http::HeaderMap;
use chrono::{Duration, Utc};
use hmac::{Hmac, KeyInit, Mac};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Arc;
use subtle::ConstantTimeEq;
use uuid::Uuid;

pub const SESSION_COOKIE: &str = "lp_session";
pub const DEVICE_COOKIE: &str = "lp_device";
pub const API_KEY_PREFIX: &str = "lp_live_";

type HmacSha256 = Hmac<Sha256>;

pub struct Resolution {
    pub subject: Subject,
    pub cookie_based: bool,
    pub set_cookie: Option<String>,
}

pub struct OtpIssued {
    pub expires_in: i64,
    pub resend_after: i64,
}

pub struct AuthService {
    identity: Arc<IdentityRepository>,
    rate_limits: Arc<RateLimitRepository>,
    mailer: Arc<dyn Mailer>,
    config: AuthConfig,
    limits: LimitsConfig,
    secret: Vec<u8>,
}

fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    for chunk in buf.chunks_mut(32) {
        let block: [u8; 32] = rand::random();
        chunk.copy_from_slice(&block[..chunk.len()]);
    }
    hex::encode(buf)
}

fn random_key_body(len: usize) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let mut out = String::with_capacity(len);
    while out.len() < len {
        let block: [u8; 32] = rand::random();
        for b in block {
            if out.len() == len {
                break;
            }
            out.push(ALPHABET[(b % ALPHABET.len() as u8) as usize] as char);
        }
    }
    out
}

pub fn normalize_email(raw: &str) -> AppResult<String> {
    let email = raw.trim().to_ascii_lowercase();
    let valid = email.len() <= 254
        && email.split_once('@').map(|(local, domain)| {
            !local.is_empty()
                && domain.contains('.')
                && !domain.starts_with('.')
                && !domain.ends_with('.')
        }) == Some(true)
        && !email.chars().any(|c| c.is_whitespace() || c == ',');
    if valid {
        Ok(email)
    } else {
        Err(AppError::validation("邮箱地址无效"))
    }
}

impl AuthService {
    pub fn new(
        identity: Arc<IdentityRepository>,
        rate_limits: Arc<RateLimitRepository>,
        mailer: Arc<dyn Mailer>,
        config: AuthConfig,
        limits: LimitsConfig,
    ) -> Self {
        let secret = if config.cookie_secret.is_empty() {
            random_hex(32).into_bytes()
        } else {
            config.cookie_secret.clone().into_bytes()
        };
        Self {
            identity,
            rate_limits,
            mailer,
            config,
            limits,
            secret,
        }
    }

    pub fn otp_ttl_minutes(&self) -> i64 {
        (self.config.otp_ttl_secs / 60).max(1)
    }

    fn cookie(&self, name: &str, value: &str, max_age_secs: i64) -> String {
        let secure = if self.config.secure_cookies {
            "; Secure"
        } else {
            ""
        };
        format!(
            "{}={}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}{}",
            name, value, max_age_secs, secure
        )
    }

    pub fn session_cookie(&self, token: &str) -> String {
        self.cookie(SESSION_COOKIE, token, self.config.session_ttl_days * 86_400)
    }

    pub fn clear_session_cookie(&self) -> String {
        self.cookie(SESSION_COOKIE, "", 0)
    }

    fn device_cookie(&self, value: &str) -> String {
        self.cookie(DEVICE_COOKIE, value, 365 * 86_400)
    }

    fn mac(&self, data: &[u8]) -> Vec<u8> {
        let mut mac =
            HmacSha256::new_from_slice(&self.secret).expect("hmac accepts any key length");
        mac.update(data);
        mac.finalize().into_bytes().to_vec()
    }

    fn sign_device(&self, id: Uuid) -> String {
        format!("{}.{}", id, hex::encode(self.mac(id.as_bytes())))
    }

    fn verify_device(&self, value: &str) -> Option<Uuid> {
        let (id, signature) = value.split_once('.')?;
        let id = Uuid::parse_str(id).ok()?;
        let expected = self.mac(id.as_bytes());
        let provided = hex::decode(signature).ok()?;
        if provided.len() == expected.len() && provided.ct_eq(&expected).into() {
            Some(id)
        } else {
            None
        }
    }

    fn otp_hash(&self, email: &str, code: &str) -> String {
        hex::encode(self.mac(format!("{}:{}", email, code).as_bytes()))
    }

    pub fn parse_cookies(headers: &HeaderMap) -> HashMap<String, String> {
        headers
            .get_all(COOKIE)
            .iter()
            .filter_map(|value| value.to_str().ok())
            .flat_map(|value| value.split(';'))
            .filter_map(|pair| {
                let (name, value) = pair.trim().split_once('=')?;
                Some((name.trim().to_string(), value.trim().to_string()))
            })
            .collect()
    }

    async fn plan(&self, id: &str) -> AppResult<Plan> {
        self.identity
            .plan(id)
            .await?
            .ok_or_else(|| AppError::internal(format!("套餐不存在: {}", id)))
    }

    fn account_subject(&self, account: AccountRow, plan: Plan, source: Source) -> Subject {
        Subject {
            kind: SubjectKind::Account,
            id: account.id,
            email: Some(account.email),
            plan,
            source,
        }
    }

    pub async fn resolve(&self, headers: &HeaderMap) -> AppResult<Resolution> {
        if let Some(bearer) = headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
        {
            let token = bearer.trim();
            if !token.starts_with(API_KEY_PREFIX) {
                return Err(AppError::unauthorized("API Key 无效"));
            }
            let account = self
                .identity
                .account_by_api_key(&hash_token(token))
                .await?
                .ok_or_else(|| AppError::unauthorized("API Key 无效或已吊销"))?;
            let plan = self.plan(&account.plan_id).await?;
            let source = headers
                .get(USER_AGENT)
                .and_then(|v| v.to_str().ok())
                .filter(|ua| ua.starts_with("lubanpng-cli"))
                .map(|_| Source::Cli)
                .unwrap_or(Source::Api);
            return Ok(Resolution {
                subject: self.account_subject(account, plan, source),
                cookie_based: false,
                set_cookie: None,
            });
        }

        let cookies = Self::parse_cookies(headers);
        if let Some(token) = cookies.get(SESSION_COOKIE).filter(|t| !t.is_empty()) {
            let ttl = self.config.session_ttl_days * 86_400;
            if let Some(account) = self
                .identity
                .account_by_session(&hash_token(token), ttl)
                .await?
            {
                let plan = self.plan(&account.plan_id).await?;
                return Ok(Resolution {
                    subject: self.account_subject(account, plan, Source::Web),
                    cookie_based: true,
                    set_cookie: None,
                });
            }
        }

        let plan = self.plan("anonymous").await?;
        if let Some(id) = cookies
            .get(DEVICE_COOKIE)
            .and_then(|v| self.verify_device(v))
        {
            self.identity.touch_device(id).await?;
            return Ok(Resolution {
                subject: Subject {
                    kind: SubjectKind::Device,
                    id,
                    email: None,
                    plan,
                    source: Source::Web,
                },
                cookie_based: true,
                set_cookie: None,
            });
        }

        let id = Uuid::new_v4();
        self.identity.touch_device(id).await?;
        Ok(Resolution {
            subject: Subject {
                kind: SubjectKind::Device,
                id,
                email: None,
                plan,
                source: Source::Web,
            },
            cookie_based: true,
            set_cookie: Some(self.device_cookie(&self.sign_device(id))),
        })
    }

    pub async fn request_code(&self, raw_email: &str, ip: &str) -> AppResult<OtpIssued> {
        let email = normalize_email(raw_email)?;
        if !self.mailer.enabled() {
            return Err(AppError::unavailable("邮件服务未配置，暂时无法发送验证码"));
        }
        let email_ok = self
            .rate_limits
            .hit(
                &format!("otp:email:{}", email),
                600,
                self.limits.otp_per_email_per_10min as i64,
            )
            .await?;
        let ip_ok = self
            .rate_limits
            .hit(
                &format!("otp:ip:{}", ip),
                3600,
                self.limits.otp_per_ip_per_hour as i64,
            )
            .await?;
        if !email_ok || !ip_ok {
            return Err(AppError::rate_limited("验证码发送过于频繁，请稍后再试"));
        }
        let code = format!("{:06}", rand::random::<u32>() % 1_000_000);
        let expires_at = Utc::now() + Duration::seconds(self.config.otp_ttl_secs);
        self.identity
            .create_otp(&email, &self.otp_hash(&email, &code), expires_at)
            .await?;
        self.mailer
            .send_login_code(&email, &code, self.otp_ttl_minutes())
            .await?;
        Ok(OtpIssued {
            expires_in: self.config.otp_ttl_secs,
            resend_after: self.config.otp_resend_secs,
        })
    }

    pub async fn verify_code(
        &self,
        raw_email: &str,
        code: &str,
    ) -> AppResult<(String, AccountRow, bool)> {
        let email = normalize_email(raw_email)?;
        let code = code.trim();
        let otp = self
            .identity
            .latest_otp(&email)
            .await?
            .filter(|otp| otp.expires_at > Utc::now())
            .ok_or_else(|| AppError::validation("验证码不存在或已过期，请重新获取"))?;
        if otp.attempts >= self.config.otp_max_attempts {
            return Err(AppError::rate_limited("验证码错误次数过多，请重新获取"));
        }
        let expected = self.otp_hash(&email, code);
        let matches: bool = expected.as_bytes().ct_eq(otp.code_hash.as_bytes()).into();
        if !matches {
            self.identity.record_otp_attempt(otp.id).await?;
            return Err(AppError::validation("验证码不正确"));
        }
        self.identity.consume_otp(otp.id).await?;
        let (account, created) = self.identity.find_or_create_account(&email).await?;
        let token = random_hex(32);
        self.identity
            .create_session(
                &hash_token(&token),
                account.id,
                self.config.session_ttl_days * 86_400,
            )
            .await?;
        Ok((token, account, created))
    }

    pub async fn logout(&self, headers: &HeaderMap) -> AppResult<()> {
        if let Some(token) = Self::parse_cookies(headers).get(SESSION_COOKIE) {
            self.identity.delete_session(&hash_token(token)).await?;
        }
        Ok(())
    }

    fn require_account(subject: &Subject) -> AppResult<Uuid> {
        if subject.is_account() {
            Ok(subject.id)
        } else {
            Err(AppError::unauthorized("请先登录"))
        }
    }

    pub async fn list_api_keys(&self, subject: &Subject) -> AppResult<Vec<ApiKeyRow>> {
        let account_id = Self::require_account(subject)?;
        self.identity.active_api_keys(account_id).await
    }

    pub async fn create_api_key(
        &self,
        subject: &Subject,
        name: &str,
    ) -> AppResult<(ApiKeyRow, String)> {
        let account_id = Self::require_account(subject)?;
        let name = name.trim();
        if name.is_empty() || name.chars().count() > 40 {
            return Err(AppError::validation("Key 名称需为 1 到 40 个字符"));
        }
        let active = self.identity.active_api_keys(account_id).await?;
        if active.len() as i32 >= subject.plan.max_api_keys {
            return Err(AppError::validation(format!(
                "当前套餐最多 {} 个可用 Key，吊销后可再新建",
                subject.plan.max_api_keys
            )));
        }
        let key = format!("{}{}", API_KEY_PREFIX, random_key_body(32));
        let prefix = key[..API_KEY_PREFIX.len() + 4].to_string();
        let suffix = key[key.len() - 4..].to_string();
        let row = self
            .identity
            .create_api_key(account_id, name, &prefix, &suffix, &hash_token(&key))
            .await?;
        Ok((row, key))
    }

    pub async fn revoke_api_key(&self, subject: &Subject, id: Uuid) -> AppResult<()> {
        let account_id = Self::require_account(subject)?;
        if self.identity.revoke_api_key(account_id, id).await? {
            Ok(())
        } else {
            Err(AppError::not_found("Key 不存在或已吊销"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_email;

    #[test]
    fn normalizes_case_and_whitespace() {
        assert_eq!(
            normalize_email("  Zibin@Example.com ").unwrap(),
            "zibin@example.com"
        );
    }

    #[test]
    fn rejects_malformed_addresses() {
        assert!(normalize_email("not-an-email").is_err());
        assert!(normalize_email("a@b").is_err());
        assert!(normalize_email("a b@example.com").is_err());
    }
}
