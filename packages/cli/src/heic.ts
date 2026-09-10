import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, extname, join } from "node:path"
import { promisify } from "node:util"

export const HEIC_EXTENSIONS = new Set([".heic", ".heif"])
export const HEIC_UNSUPPORTED_MESSAGE = "HEIC 只能在 macOS 上由系统转换后上传，其他系统请先导出为 JPEG"
export const HEIC_IN_PLACE_MESSAGE = "HEIC 会转成 JPEG，不能就地覆盖，请用 --out 或默认输出"
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
): Promise<PreparedUpload> => {
  if (platform !== "darwin") throw new Error(HEIC_UNSUPPORTED_MESSAGE)
  const dir = await mkdtemp(join(tmpdir(), "lubanpng-heic-"))
  const name = `${basename(sourcePath, extname(sourcePath))}.jpg`
  const target = join(dir, name)
  const cleanup = (): Promise<void> => rm(dir, { recursive: true, force: true })
  try {
    await run("sips", ["-s", "format", "jpeg", "-s", "formatOptions", SIPS_JPEG_QUALITY, sourcePath, "--out", target])
  } catch (error) {
    await cleanup()
    throw new Error(`HEIC 转换失败：${error instanceof Error ? error.message : String(error)}`)
  }
  return { path: target, name, cleanup }
}
