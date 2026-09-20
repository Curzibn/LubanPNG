use crate::config::MailConfig;
use crate::error::{AppError, AppResult};
use crate::i18n::{login_code_email, Lang, Msg};
use async_trait::async_trait;
use lettre::message::header::ContentType;
use lettre::message::Mailbox;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

#[async_trait]
pub trait Mailer: Send + Sync {
    fn enabled(&self) -> bool;
    async fn send_login_code(
        &self,
        to: &str,
        code: &str,
        ttl_minutes: i64,
        lang: Lang,
    ) -> AppResult<()>;
}

pub struct SmtpMailer {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
}

impl SmtpMailer {
    pub fn from_config(config: &MailConfig) -> AppResult<Self> {
        let builder = if config.smtp_port == 465 {
            AsyncSmtpTransport::<Tokio1Executor>::relay(&config.smtp_host)
        } else {
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.smtp_host)
        }
        .map_err(|e| AppError::Config(format!("SMTP 配置无效: {}", e)))?;
        let transport = builder
            .port(config.smtp_port)
            .credentials(Credentials::new(
                config.username.clone(),
                config.password.clone(),
            ))
            .build();
        let from = config
            .from
            .parse::<Mailbox>()
            .map_err(|e| AppError::Config(format!("发件人地址无效: {}", e)))?;
        Ok(Self { transport, from })
    }
}

#[async_trait]
impl Mailer for SmtpMailer {
    fn enabled(&self) -> bool {
        true
    }

    async fn send_login_code(
        &self,
        to: &str,
        code: &str,
        ttl_minutes: i64,
        lang: Lang,
    ) -> AppResult<()> {
        let recipient = to.parse::<Mailbox>().map_err(|e| {
            AppError::validation(
                Msg::InvalidEmailDetail {
                    detail: e.to_string(),
                },
                lang,
            )
        })?;
        let content = login_code_email(lang, code, ttl_minutes);
        let message = Message::builder()
            .from(self.from.clone())
            .to(recipient)
            .subject(content.subject)
            .header(ContentType::TEXT_PLAIN)
            .body(content.body)
            .map_err(|e| AppError::internal(format!("构造邮件失败: {}", e)))?;
        self.transport.send(message).await.map_err(|e| {
            AppError::unavailable(
                Msg::MailSendFailed {
                    detail: e.to_string(),
                },
                lang,
            )
        })?;
        Ok(())
    }
}

pub struct DisabledMailer;

#[async_trait]
impl Mailer for DisabledMailer {
    fn enabled(&self) -> bool {
        false
    }

    async fn send_login_code(
        &self,
        _to: &str,
        _code: &str,
        _ttl_minutes: i64,
        lang: Lang,
    ) -> AppResult<()> {
        Err(AppError::unavailable(Msg::MailUnavailable, lang))
    }
}
