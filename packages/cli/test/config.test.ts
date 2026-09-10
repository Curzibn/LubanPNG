import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { clearStoredKey, configDir, readStoredKey, resolveApiKey, writeStoredKey } from "../src/config.js"

describe("config store", () => {
  let home: string
  let env: NodeJS.ProcessEnv

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "lubanpng-config-"))
    env = { XDG_CONFIG_HOME: join(home, "config"), APPDATA: join(home, "appdata") }
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it("creates the per-user config directory", () => {
    expect(configDir(env).endsWith(join("lubanpng"))).toBe(true)
  })

  it("writes, reads and clears the stored key", async () => {
    expect(await readStoredKey(env)).toBeNull()
    await writeStoredKey("lp_test_key", env)
    expect(await readStoredKey(env)).toBe("lp_test_key")
    expect(await clearStoredKey(env)).toBe(true)
    expect(await readStoredKey(env)).toBeNull()
    expect(await clearStoredKey(env)).toBe(false)
  })

  it("prefers LUBANPNG_API_KEY over the stored key", async () => {
    await writeStoredKey("lp_stored", env)
    expect(await resolveApiKey({ ...env, LUBANPNG_API_KEY: "lp_env" })).toBe("lp_env")
    expect(await resolveApiKey(env)).toBe("lp_stored")
  })
})
