import { API_KEY_ENV, resolveApiKey } from "../config.js"
import { clientFor, type Context } from "../context.js"
import { UsageError } from "../errors.js"
import { formatResetDate, periodNoun } from "../format.js"

export const usageCommand = async (context: Context): Promise<number> => {
  const key = await resolveApiKey(context.env)
  if (!key) throw new UsageError(`未登录，请先运行 lubanpng login 或设置 ${API_KEY_ENV}`)

  const { data } = await clientFor(context, key).me()
  const label = periodNoun(data.plan.period)
  const reset = formatResetDate(data.quota.resets_at)
  const tail = reset === "" ? "" : ` · ${reset}重置`
  context.io.write(`  ${data.plan.name}套餐 · ${label}已用 ${data.quota.used} / ${data.quota.limit}${tail}\n`)
  return 0
}
