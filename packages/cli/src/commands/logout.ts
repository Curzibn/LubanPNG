import { clearStoredKey } from "../config.js"
import type { Context } from "../context.js"
import { translator } from "../i18n/messages.js"

export const logoutCommand = async (context: Context): Promise<number> => {
  const t = translator(context.lang)
  const cleared = await clearStoredKey(context.env)
  context.io.write(cleared ? `${t("logout.cleared")}\n` : `${t("logout.empty")}\n`)
  return 0
}
