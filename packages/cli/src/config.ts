import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export const API_KEY_ENV = "LUBANPNG_API_KEY"

export const configDir = (env: NodeJS.ProcessEnv = process.env): string => {
  if (process.platform === "win32") {
    const appData = env.APPDATA?.trim()
    return join(appData && appData !== "" ? appData : join(homedir(), "AppData", "Roaming"), "lubanpng")
  }
  const base = env.XDG_CONFIG_HOME?.trim()
  return join(base && base !== "" ? base : join(homedir(), ".config"), "lubanpng")
}

export const configPath = (env: NodeJS.ProcessEnv = process.env): string =>
  join(configDir(env), "config.json")

export const readStoredKey = async (env: NodeJS.ProcessEnv = process.env): Promise<string | null> => {
  try {
    const raw = await readFile(configPath(env), "utf8")
    const parsed = JSON.parse(raw) as { api_key?: unknown }
    const key = typeof parsed.api_key === "string" ? parsed.api_key.trim() : ""
    return key === "" ? null : key
  } catch {
    return null
  }
}

export const writeStoredKey = async (
  key: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> => {
  const dir = configDir(env)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await writeFile(configPath(env), `${JSON.stringify({ api_key: key }, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  })
}

export const clearStoredKey = async (env: NodeJS.ProcessEnv = process.env): Promise<boolean> => {
  try {
    await rm(configPath(env))
    return true
  } catch {
    return false
  }
}

export const envApiKey = (env: NodeJS.ProcessEnv = process.env): string | null => {
  const value = env[API_KEY_ENV]?.trim()
  return value && value !== "" ? value : null
}

export const resolveApiKey = async (env: NodeJS.ProcessEnv = process.env): Promise<string | null> =>
  envApiKey(env) ?? (await readStoredKey(env))
