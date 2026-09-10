import { clearStoredKey } from "../config.js"
import type { Context } from "../context.js"

export const logoutCommand = async (context: Context): Promise<number> => {
  const cleared = await clearStoredKey(context.env)
  context.io.write(cleared ? "  已退出登录，本机 API Key 已清除\n" : "  本机没有保存 API Key\n")
  return 0
}
