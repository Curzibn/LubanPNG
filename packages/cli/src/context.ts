import type { ApiClient } from "./api.js"
import { ApiClient as Client } from "./api.js"
import type { Lang } from "./i18n/messages.js"
import type { Io } from "./io.js"

export type Context = {
  apiBase: string
  env: NodeJS.ProcessEnv
  io: Io
  lang: Lang
}

export const clientFor = (context: Context, apiKey: string | null): ApiClient =>
  new Client({ baseUrl: context.apiBase, apiKey, lang: context.lang })
