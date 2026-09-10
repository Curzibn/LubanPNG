import { clientFor, type Context } from "../context.js"
import { API_KEY_ENV, envApiKey, writeStoredKey } from "../config.js"
import { UsageError } from "../errors.js"
import { periodNoun } from "../format.js"

export const loginCommand = async (context: Context): Promise<number> => {
  const fromEnv = envApiKey(context.env)
  const key = fromEnv ?? (await context.io.promptSecret("  粘贴你的 API Key: ")).trim()
  if (key === "") throw new UsageError("API Key 不能为空")

  const { data } = await clientFor(context, key).me()
  const who = data.email ?? "当前账号"
  const label = periodNoun(data.plan.period)

  if (fromEnv) {
    context.io.write(
      `  环境变量 ${API_KEY_ENV} 校验通过 · ${who} · ${label}剩余 ${data.quota.remaining} 次（未写入本机配置）\n`,
    )
  } else {
    await writeStoredKey(key, context.env)
    context.io.write(`  已登录 ${who} · ${label}剩余 ${data.quota.remaining} 次\n`)
  }
  return 0
}
