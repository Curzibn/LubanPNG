import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, extname, join } from "node:path"
import { promisify } from "node:util"
import { DEFAULT_LANG, translator, type Lang } from "./i18n/messages.js"

export const HEIC_EXTENSIONS = new Set([".heic", ".heif"])
export const heicUnsupportedMessage = (lang: Lang): string => translator(lang)("heic.unsupported")
export const heicInPlaceMessage = (lang: Lang): string => translator(lang)("heic.inPlace")
const SIPS_JPEG_QUALITY = "92"

export type CommandRunner = (command: string, args: string[]) => Promise<void>

const runCommand: CommandRunner = async (command, args) => {
  await promisify(execFile)(command, args)
}

export const isHeicPath = (path: string): boolean => HEIC_EXTENSIONS.has(extname(path).toLowerCase())

export type PreparedUpload = { path: string; name: string; cleanup: () => Promise<void> }

export const prepareHeicUpload = async (
  sourcePath: string,
  platform: NodeJS.Platform = process.platform,
  run: CommandRunner = runCommand,
  lang: Lang = DEFAULT_LANG,
): Promise<PreparedUpload> => {
  const t = translator(lang)
  if (platform !== "darwin") throw new Error(t("heic.unsupported"))
  const dir = await mkdtemp(join(tmpdir(), "lubanpng-heic-"))
  const name = `${basename(sourcePath, extname(sourcePath))}.jpg`
  const target = join(dir, name)
  const cleanup = (): Promise<void> => rm(dir, { recursive: true, force: true })
  try {
    await run("sips", ["-s", "format", "jpeg", "-s", "formatOptions", SIPS_JPEG_QUALITY, sourcePath, "--out", target])
  } catch (error) {
    await cleanup()
    throw new Error(t("heic.convertFailed", { detail: error instanceof Error ? error.message : String(error) }))
  }
  return { path: target, name, cleanup }
}
