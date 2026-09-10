import type { ApiClient } from "./api.js"
import { ApiClient as Client } from "./api.js"
import type { Io } from "./io.js"

export type Context = {
  apiBase: string
  env: NodeJS.ProcessEnv
  io: Io
}

export const clientFor = (context: Context, apiKey: string | null): ApiClient =>
  new Client({ baseUrl: context.apiBase, apiKey })
