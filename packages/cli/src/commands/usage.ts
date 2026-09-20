import { API_KEY_ENV, resolveApiKey } from "../config.js"
import { clientFor, type Context } from "../context.js"
import { UsageError } from "../errors.js"
import { formatResetDate } from "../format.js"
import { hasMessage, translator } from "../i18n/messages.js"

export const usageCommand = async (context: Context): Promise<number> => {
  const t = translator(context.lang)
  const key = await resolveApiKey(context.env)
  if (!key) throw new UsageError(t("error.notSignedIn", { env: API_KEY_ENV }))

  const { data } = await clientFor(context, key).me()
  const planKey = `plan.${data.plan.id}`
  const plan = hasMessage(context.lang, planKey) ? t(planKey) : data.plan.name
  const reset = formatResetDate(data.quota.resets_at, context.lang)
  const tail = reset === "" ? "" : t("usage.reset", { date: reset })
  context.io.write(
    `${t(data.plan.period === "day" ? "usage.day" : "usage.month", {
      plan,
      used: data.quota.used,
      limit: data.quota.limit,
      reset: tail,
    })}\n`,
  )
  return 0
}
