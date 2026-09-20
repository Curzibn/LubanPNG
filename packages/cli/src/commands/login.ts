import { clientFor, type Context } from "../context.js"
import { API_KEY_ENV, envApiKey, writeStoredKey } from "../config.js"
import { UsageError } from "../errors.js"
import { translator } from "../i18n/messages.js"

export const loginCommand = async (context: Context): Promise<number> => {
  const t = translator(context.lang)
  const fromEnv = envApiKey(context.env)
  const key = fromEnv ?? (await context.io.promptSecret(t("login.prompt"))).trim()
  if (key === "") throw new UsageError(t("error.emptyKey"))

  const { data } = await clientFor(context, key).me()
  const who = data.email ?? t("login.anonymous")
  const remaining = t(data.plan.period === "day" ? "quota.remaining.day" : "quota.remaining.month", {
    count: data.quota.remaining,
  })

  if (fromEnv) {
    context.io.write(`${t("login.envVerified", { env: API_KEY_ENV, who, remaining })}\n`)
  } else {
    await writeStoredKey(key, context.env)
    context.io.write(`${t("login.stored", { who, remaining })}\n`)
  }
  return 0
}
