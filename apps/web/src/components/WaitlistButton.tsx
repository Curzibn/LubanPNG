import { useState } from "react"
import { Link } from "react-router"
import { errorMessage, joinWaitlist, type WaitlistPlanId } from "../api/client.ts"
import { useI18n } from "../i18n/I18nProvider.tsx"
import { localizedPath } from "../i18n/locale.ts"
import { cx } from "../lib/cx.ts"
import { useSession } from "../session/sessionContext.ts"
import { Button, type ButtonSize } from "./Button.tsx"
import { Notice } from "./Notice.tsx"

export const WaitlistButton = ({
  planId,
  dark = false,
  size = "lg",
  className,
}: {
  planId: WaitlistPlanId
  dark?: boolean
  size?: ButtonSize
  className?: string
}) => {
  const { locale, t } = useI18n()
  const { signedIn } = useSession()
  const [joined, setJoined] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!signedIn) {
    return (
      <div className={cx("flex w-full flex-col gap-2", className)}>
        <Button variant={dark ? "outlineNight" : "outline"} size={size} className="w-full" disabled>
          {t("pricing.waitlist.disabled")}
        </Button>
        <p className={cx("text-label-sm", dark ? "text-night-muted" : "text-ink-secondary")}>
          {t("pricing.waitlist.disabledHint")}{" "}
          <Link
            to={localizedPath("/login", locale)}
            className={cx(
              "transition-colors",
              dark ? "text-jade-bright hover:text-night-text" : "text-vermilion hover:text-vermilion-hover",
            )}
          >
            {t("pricing.waitlist.signIn")}
          </Link>
        </p>
      </div>
    )
  }

  const handleJoin = async () => {
    setSubmitting(true)
    try {
      await joinWaitlist(planId)
      setJoined(true)
      setError(null)
    } catch (joinError) {
      setError(errorMessage(joinError, t("pricing.waitlist.error")))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={cx("flex w-full flex-col gap-2", className)}>
      {error && <Notice tone="error">{error}</Notice>}
      <Button
        variant={joined ? (dark ? "outlineNight" : "outline") : "accent"}
        size={size}
        className="w-full"
        disabled={submitting || joined}
        onClick={() => void handleJoin()}
      >
        {joined ? t("pricing.waitlist.joined") : submitting ? t("pricing.waitlist.submitting") : t("pricing.waitlist.join")}
      </Button>
    </div>
  )
}
