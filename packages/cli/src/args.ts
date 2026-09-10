import { UsageError } from "./errors.js"

export type Command = "login" | "logout" | "compress" | "usage"

export const TARGET_FORMATS = ["png", "jpeg", "webp", "avif"] as const
export type TargetFormat = (typeof TARGET_FORMATS)[number]

export type ParsedCommand =
  | { command: "login"; apiBase: string | undefined }
  | { command: "logout"; apiBase: string | undefined }
  | { command: "usage"; apiBase: string | undefined }
  | {
      command: "compress"
      apiBase: string | undefined
      paths: string[]
      out: string | undefined
      inPlace: boolean
      recursive: boolean
      concurrency: number
      convert: TargetFormat | undefined
      background: string | undefined
    }
  | { command: "help" }
  | { command: "version" }

export const DEFAULT_CONCURRENCY = 4
export const MAX_CONCURRENCY = 16

const STRING_OPTIONS = new Set(["--api-base", "--out", "--concurrency", "--convert", "--background"])
const BOOLEAN_OPTIONS = new Set(["--in-place", "--recursive", "--help", "-h", "--version", "-v"])

const COMMANDS = new Set<Command>(["login", "logout", "compress", "usage"])

const readConcurrency = (raw: string): number => {
  if (!/^[1-9]\d*$/.test(raw)) throw new UsageError(`--concurrency 必须是正整数，收到：${raw}`)
  const value = Number(raw)
  if (value > MAX_CONCURRENCY) {
    throw new UsageError(`--concurrency 最大 ${MAX_CONCURRENCY}，收到：${raw}`)
  }
  return value
}

const readTarget = (raw: string): TargetFormat => {
  const lowered = raw.trim().toLowerCase()
  const normalized = lowered === "jpg" ? "jpeg" : lowered
  if (!(TARGET_FORMATS as readonly string[]).includes(normalized)) {
    throw new UsageError(`--convert 只支持 png、jpeg、webp、avif，收到：${raw}`)
  }
  return normalized as TargetFormat
}

const readBackground = (raw: string): string => {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(raw.trim())
  if (!match) throw new UsageError(`--background 需要是 #RRGGBB 形式的颜色，收到：${raw}`)
  return `#${(match[1] as string).toLowerCase()}`
}

export const parseArgv = (argv: string[]): ParsedCommand => {
  const options = new Map<string, string | boolean>()
  const positionals: string[] = []
  let index = 0

  while (index < argv.length) {
    const token = argv[index] as string
    if (token === "--") {
      positionals.push(...argv.slice(index + 1))
      break
    }
    if (token.startsWith("-") && token !== "-") {
      const equals = token.indexOf("=")
      const name = equals >= 0 ? token.slice(0, equals) : token
      const inlineValue = equals >= 0 ? token.slice(equals + 1) : undefined
      if (BOOLEAN_OPTIONS.has(name)) {
        if (inlineValue !== undefined) throw new UsageError(`选项 ${name} 不接受值`)
        options.set(name, true)
        index += 1
        continue
      }
      if (STRING_OPTIONS.has(name)) {
        const value = inlineValue ?? (argv[index + 1] as string | undefined)
        if (value === undefined) throw new UsageError(`选项 ${name} 缺少值`)
        options.set(name, value)
        index += inlineValue !== undefined ? 1 : 2
        continue
      }
      throw new UsageError(`未知选项：${name}`)
    }
    positionals.push(token)
    index += 1
  }

  if (options.has("--help") || options.has("-h")) return { command: "help" }
  if (options.has("--version") || options.has("-v")) return { command: "version" }

  const apiBase = options.get("--api-base")
  const apiBaseValue = typeof apiBase === "string" ? apiBase : undefined
  const name = positionals[0]

  if (name === undefined) {
    throw new UsageError("缺少子命令。可用命令：login、logout、compress、usage")
  }
  if (!COMMANDS.has(name as Command)) {
    throw new UsageError(`未知命令：${name}。可用命令：login、logout、compress、usage`)
  }

  if (name === "compress") {
    const out = options.get("--out")
    const outValue = typeof out === "string" ? out : undefined
    const inPlace = options.get("--in-place") === true
    const recursive = options.get("--recursive") === true
    const concurrency = options.get("--concurrency")
    const convertRaw = options.get("--convert")
    const backgroundRaw = options.get("--background")
    if (inPlace && outValue !== undefined) {
      throw new UsageError("--in-place 与 --out 不能同时使用")
    }
    const convert = typeof convertRaw === "string" ? readTarget(convertRaw) : undefined
    const background = typeof backgroundRaw === "string" ? readBackground(backgroundRaw) : undefined
    if (inPlace && convert !== undefined) {
      throw new UsageError("--in-place 不能与 --convert 同时使用，转换结果请用 --out 或默认输出")
    }
    if (background !== undefined && convert === undefined) {
      throw new UsageError("--background 需要与 --convert 一起使用")
    }
    const paths = positionals.slice(1)
    if (paths.length === 0) throw new UsageError("compress 至少需要一个文件或目录路径")
    return {
      command: "compress",
      apiBase: apiBaseValue,
      paths,
      out: outValue,
      inPlace,
      recursive,
      concurrency:
        typeof concurrency === "string" ? readConcurrency(concurrency) : DEFAULT_CONCURRENCY,
      convert,
      background,
    }
  }

  if (positionals.length > 1) {
    throw new UsageError(`${name} 不接受多余参数：${positionals.slice(1).join(" ")}`)
  }

  if (name === "login") return { command: "login", apiBase: apiBaseValue }
  if (name === "logout") return { command: "logout", apiBase: apiBaseValue }
  return { command: "usage", apiBase: apiBaseValue }
}
