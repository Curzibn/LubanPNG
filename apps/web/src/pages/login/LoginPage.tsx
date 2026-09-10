import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { ErrorCode, errorMessage, isApiError, requestOtp, verifyOtp } from "../../api/client.ts"
import { usePageTitle } from "../../app/usePageTitle.ts"
import { Button } from "../../components/Button.tsx"
import { Container } from "../../components/Container.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { TextField } from "../../components/TextField.tsx"
import { cx } from "../../lib/cx.ts"
import { useSession } from "../../session/sessionContext.ts"
import { OTP_LENGTH, OtpInput } from "./OtpInput.tsx"
import { useCountdown } from "./useCountdown.ts"

const DEFAULT_RESEND_SECONDS = 60
const DEFAULT_EXPIRES_SECONDS = 600
const MAIL_UNAVAILABLE_MESSAGE = "邮件服务暂未开通，请稍后再试"
const INVALID_EMAIL_MESSAGE = "请输入有效的邮箱地址"

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const safeNextPath = (raw: string | null): string => {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard"
  return raw
}

const otpErrorMessage = (error: unknown): string => {
  if (isApiError(error) && (error.status === 503 || error.code === ErrorCode.serviceUnconfigured)) {
    return MAIL_UNAVAILABLE_MESSAGE
  }
  return errorMessage(error, "发送失败，请稍后再试")
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
  usePageTitle("登录")
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const session = useSession()
  const nextPath = safeNextPath(searchParams.get("next"))

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

  const sendCode = async () => {
    const trimmed = email.trim()
    if (!emailPattern.test(trimmed)) {
      setEmailError(INVALID_EMAIL_MESSAGE)
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
      setCodeError(errorMessage(error, "验证失败，请重试"))
      setCode("")
    } finally {
      setVerifying(false)
    }
  }

  const handleCodeSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (code.length !== OTP_LENGTH) {
      setCodeError(`请输入 ${OTP_LENGTH} 位验证码`)
      return
    }
    void verify(code)
  }

  return (
    <Container className="pb-4 pt-10 md:pt-24">
      <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center lg:gap-12">
        <StepCard
          active={step === "email"}
          eyebrow="第一步"
          title="登录或注册"
          description="不设密码。输入邮箱，我们发一个 6 位验证码。"
        >
          <form onSubmit={handleEmailSubmit} noValidate className="flex flex-col gap-6">
            <TextField
              id="login-email"
              label="邮箱"
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
              {sending ? "发送中…" : "发送验证码"}
            </Button>
            <p className="text-label-sm leading-prose text-ink-secondary">
              继续即表示同意{" "}
              <Link to="/terms" className="text-vermilion hover:text-vermilion-hover">
                服务条款
              </Link>{" "}
              与{" "}
              <Link to="/privacy" className="text-vermilion hover:text-vermilion-hover">
                隐私政策
              </Link>
              。首次登录自动创建账号，赠送每月 50 次压缩。
            </p>
          </form>
        </StepCard>

        <StepCard
          active={step === "code"}
          eyebrow="第二步"
          title="输入验证码"
          description={
            step === "code" ? (
              <>
                已发送到 <span className="font-mono text-ink">{email}</span>，{expiresMinutes} 分钟内有效。
              </>
            ) : (
              "发送验证码后，在这里输入邮件里的 6 位数字。"
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
              {verifying ? "登录中…" : "登录"}
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-2 text-label text-ink-secondary">
              <span>
                没收到？
                <button
                  type="button"
                  onClick={() => void sendCode()}
                  disabled={sending || resendSeconds > 0}
                  className="text-vermilion transition-colors hover:text-vermilion-hover disabled:cursor-default disabled:text-ink-secondary"
                >
                  重新发送
                </button>
                {resendSeconds > 0 && `（${resendSeconds} 秒）`}
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
                换个邮箱
              </button>
            </div>
          </form>
        </StepCard>
      </div>
      <p className="pt-8 text-center text-label text-ink-secondary md:pt-10">
        同一邮箱 10 分钟内最多申请 3 次验证码，连续错 5 次需重新申请。
      </p>
    </Container>
  )
}
