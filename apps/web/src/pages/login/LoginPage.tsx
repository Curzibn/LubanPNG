import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { ErrorCode, errorMessage, isApiError, requestOtp, verifyOtp } from "../../api/client.ts"
import { usePageMeta } from "../../app/usePageMeta.ts"
import { Button } from "../../components/Button.tsx"
import { Container } from "../../components/Container.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { TextField } from "../../components/TextField.tsx"
import { useI18n } from "../../i18n/I18nProvider.tsx"
import { localizedPath } from "../../i18n/locale.ts"
import { cx } from "../../lib/cx.ts"
import { useSession } from "../../session/sessionContext.ts"
import { OTP_LENGTH, OtpInput } from "./OtpInput.tsx"
import { useCountdown } from "./useCountdown.ts"

const DEFAULT_RESEND_SECONDS = 60
const DEFAULT_EXPIRES_SECONDS = 600

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const safeNextPath = (raw: string | null): string => {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard"
  return raw
}

type Step = "email" | "code"

const StepCard = ({
  active,
  eyebrow,
  title,
  description,
  children,
}: {
  active: boolean
  eyebrow: string
  title: string
  description: ReactNode
  children: ReactNode
}) => (
  <section
    inert={!active}
    aria-current={active ? "step" : undefined}
    className={cx(
      "flex w-full max-w-card flex-col gap-6 rounded-sheet border-thin bg-surface p-6 transition-opacity md:p-10",
      active ? "border-hairline" : "border-hairline opacity-muted",
    )}
  >
    <div className="flex flex-col gap-2">
      <Eyebrow size="sm">{eyebrow}</Eyebrow>
      <h2 className="font-display text-display-sm text-ink">{title}</h2>
      <p className="text-ui leading-prose text-ink-secondary">{description}</p>
    </div>
    {children}
  </section>
)

export const LoginPage = () => {
  const { locale, t } = useI18n()
  usePageMeta("login")
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const session = useSession()
  const nextPath = localizedPath(safeNextPath(searchParams.get("next")), locale)

  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState("")
  const [emailError, setEmailError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [resendAt, setResendAt] = useState<number | null>(null)
  const [expiresMinutes, setExpiresMinutes] = useState(DEFAULT_EXPIRES_SECONDS / 60)
  const [code, setCode] = useState("")
  const [codeError, setCodeError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const resendSeconds = useCountdown(resendAt)

  useEffect(() => {
    if (session.status === "ready" && session.signedIn) navigate(nextPath, { replace: true })
  }, [session.status, session.signedIn, navigate, nextPath])

  const otpErrorMessage = (error: unknown): string => {
    if (isApiError(error) && (error.status === 503 || error.code === ErrorCode.serviceUnconfigured)) {
      return t("login.error.mailUnavailable")
    }
    return errorMessage(error, t("login.error.sendFailed"))
  }

  const sendCode = async () => {
    const trimmed = email.trim()
    if (!emailPattern.test(trimmed)) {
      setEmailError(t("login.error.invalidEmail"))
      return
    }
    setEmailError(null)
    setSending(true)
    try {
      const result = await requestOtp(trimmed)
      setEmail(trimmed)
      setResendAt(Date.now() + (result.resend_after || DEFAULT_RESEND_SECONDS) * 1000)
      setExpiresMinutes(Math.max(1, Math.round((result.expires_in || DEFAULT_EXPIRES_SECONDS) / 60)))
      setCode("")
      setCodeError(null)
      setStep("code")
    } catch (error) {
      const message = otpErrorMessage(error)
      if (step === "code") setCodeError(message)
      else setEmailError(message)
    } finally {
      setSending(false)
    }
  }

  const handleEmailSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void sendCode()
  }

  const verify = async (candidate: string) => {
    if (candidate.length !== OTP_LENGTH || verifying) return
    setVerifying(true)
    setCodeError(null)
    try {
      await verifyOtp(email, candidate)
      await session.refresh()
      navigate(nextPath, { replace: true })
    } catch (error) {
      setCodeError(errorMessage(error, t("login.error.verifyFailed")))
      setCode("")
    } finally {
      setVerifying(false)
    }
  }

  const handleCodeSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (code.length !== OTP_LENGTH) {
      setCodeError(t("login.error.codeLength", { count: OTP_LENGTH }))
      return
    }
    void verify(code)
  }

  return (
    <Container className="pb-4 pt-10 md:pt-24">
      <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center lg:gap-12">
        <StepCard
          active={step === "email"}
          eyebrow={t("login.step1")}
          title={t("login.title.email")}
          description={t("login.desc.email")}
        >
          <form onSubmit={handleEmailSubmit} noValidate className="flex flex-col gap-6">
            <TextField
              id="login-email"
              label={t("login.email")}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              placeholder="zibin@example.com"
              value={email}
              disabled={sending || step === "code"}
              error={emailError}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Button type="submit" variant="ink" size="xl" disabled={sending || step === "code"} className="w-full">
              {sending ? t("login.sending") : t("login.send")}
            </Button>
            <p className="text-label-sm leading-prose text-ink-secondary">
              {t("login.terms.prefix")}{" "}
              <Link to={localizedPath("/terms", locale)} className="text-vermilion hover:text-vermilion-hover">
                {t("login.terms.link")}
              </Link>{" "}
              {t("login.terms.and")}{" "}
              <Link to={localizedPath("/privacy", locale)} className="text-vermilion hover:text-vermilion-hover">
                {t("login.terms.privacy")}
              </Link>
              {t("login.terms.suffix")}
            </p>
          </form>
        </StepCard>

        <StepCard
          active={step === "code"}
          eyebrow={t("login.step2")}
          title={t("login.code.title")}
          description={
            step === "code" ? (
              <>
                {t("login.code.sentPrefix")} <span className="font-mono text-ink">{email}</span>
                {t("login.code.sentSuffix", { minutes: expiresMinutes })}
              </>
            ) : (
              t("login.code.idle")
            )
          }
        >
          <form onSubmit={handleCodeSubmit} className="flex flex-col gap-6">
            <OtpInput
              value={code}
              onChange={(next) => {
                setCode(next)
                if (codeError) setCodeError(null)
              }}
              onComplete={(complete) => void verify(complete)}
              disabled={step !== "code" || verifying}
              autoFocus={step === "code"}
            />
            {codeError && (
              <p role="alert" className="text-label text-vermilion">
                {codeError}
              </p>
            )}
            <Button type="submit" variant="ink" size="xl" disabled={step !== "code" || verifying} className="w-full">
              {verifying ? t("login.signingIn") : t("login.signIn")}
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-2 text-label text-ink-secondary">
              <span>
                {t("login.noCode")}
                <button
                  type="button"
                  onClick={() => void sendCode()}
                  disabled={sending || resendSeconds > 0}
                  className="text-vermilion transition-colors hover:text-vermilion-hover disabled:cursor-default disabled:text-ink-secondary"
                >
                  {t("login.resend")}
                </button>
                {resendSeconds > 0 && t("login.resendIn", { seconds: resendSeconds })}
              </span>
              <button
                type="button"
                onClick={() => {
                  setStep("email")
                  setCode("")
                  setCodeError(null)
                }}
                className="text-vermilion transition-colors hover:text-vermilion-hover"
              >
                {t("login.changeEmail")}
              </button>
            </div>
          </form>
        </StepCard>
      </div>
      <p className="pt-8 text-center text-label text-ink-secondary md:pt-10">{t("login.limitNote")}</p>
    </Container>
  )
}
