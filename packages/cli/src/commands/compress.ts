import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { basename, dirname, extname, join, relative as relativePath, resolve } from "node:path"
import {
  ApiClient,
  describeError,
  type Quota,
  type TaskStatus,
} from "../api.js"
import type { TargetFormat } from "../args.js"
import { API_KEY_ENV, resolveApiKey } from "../config.js"
import type { Context } from "../context.js"
import { UsageError } from "../errors.js"
import { formatBytes, formatSavings, formatSizePair, periodNoun, savingsPercent } from "../format.js"

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"])
const FORMAT_EXTENSIONS: Record<string, string> = { png: ".png", jpeg: ".jpg", gif: ".gif", webp: ".webp", avif: ".avif" }
const SUPPORTED_FORMATS_LABEL = "PNG / JPEG / GIF / WebP / AVIF"
const WAIT_SECONDS = 30
const MAX_POLL_ROUNDS = 40
const SIZE_COLUMN = 9

export type CompressOptions = {
  paths: string[]
  out: string | undefined
  inPlace: boolean
  recursive: boolean
  concurrency: number
  convert?: TargetFormat | undefined
  background?: string | undefined
}

type Collected = { path: string; name: string; relative: string }

type FileOutcome = {
  file: Collected
  ok: boolean
  retained: boolean
  converted: string | null
  originalSize: number
  compressedSize: number
  error: string | null
}

const sameFamily = (extension: string, format: string): boolean => {
  const current = extension.toLowerCase()
  const target = FORMAT_EXTENSIONS[format]
  return target !== undefined && (current === target || (target === ".jpg" && current === ".jpeg"))
}

export const outputExtensionFor = (sourcePath: string, format: string | null | undefined): string => {
  const current = extname(sourcePath)
  if (!format) return current
  const target = FORMAT_EXTENSIONS[format]
  if (target === undefined || sameFamily(current, format)) return current
  return target
}

const walk = async (
  root: string,
  current: string,
  push: (item: Collected) => void,
): Promise<void> => {
  const entries = await readdir(current, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(current, entry.name)
    if (entry.isDirectory()) {
      await walk(root, full, push)
    } else if (entry.isFile() && IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      push({ path: full, name: entry.name, relative: relativePath(root, full) })
    }
  }
}

export const collectFiles = async (inputs: string[], recursive: boolean): Promise<Collected[]> => {
  const collected: Collected[] = []
  const seen = new Set<string>()
  const push = (item: Collected): void => {
    const key = resolve(item.path)
    if (seen.has(key)) return
    seen.add(key)
    collected.push(item)
  }
  for (const input of inputs) {
    let info
    try {
      info = await stat(input)
    } catch {
      throw new UsageError(`路径不存在：${input}`)
    }
    if (info.isDirectory()) {
      if (!recursive) throw new UsageError(`目录需要加 --recursive：${input}`)
      await walk(input, input, push)
    } else if (info.isFile()) {
      push({ path: input, name: basename(input), relative: basename(input) })
    } else {
      throw new UsageError(`不支持的路径类型：${input}`)
    }
  }
  return collected
}

const withExtension = (path: string, extension: string): string => {
  const current = extname(path)
  return `${path.slice(0, path.length - current.length)}${extension}`
}

const outputPathFor = (file: Collected, options: CompressOptions, format: string | null | undefined): string => {
  if (options.inPlace) return file.path
  const extension = outputExtensionFor(file.path, format)
  if (options.out !== undefined) return join(options.out, withExtension(file.relative, extension))
  const ext = extname(file.path)
  return `${file.path.slice(0, file.path.length - ext.length)}.min${extension}`
}

const writeFileAtomic = async (target: string, bytes: Uint8Array): Promise<void> => {
  const temp = `${target}.lubanpng-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  try {
    await writeFile(temp, bytes)
    await rename(temp, target)
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined)
    throw error
  }
}

const assertNoTargetConflicts = (files: Collected[], options: CompressOptions): void => {
  const byTarget = new Map<string, string[]>()
  for (const file of files) {
    const target = resolve(outputPathFor(file, options, options.convert))
    const sources = byTarget.get(target)
    if (sources === undefined) {
      byTarget.set(target, [file.path])
    } else {
      sources.push(file.path)
    }
  }
  const conflicts = [...byTarget.entries()].filter(([, sources]) => sources.length > 1)
  if (conflicts.length === 0) return
  const detail = conflicts.map(([target, sources]) => `${target}（${sources.join("、")}）`).join("；")
  throw new UsageError(`输出路径冲突：${detail}。请调整输入路径或分批压缩`)
}

const runPool = async <T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> => {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    let next = queue.shift()
    while (next !== undefined) {
      await worker(next)
      next = queue.shift()
    }
  })
  await Promise.all(workers)
}

const waitForCompletion = async (
  client: ApiClient,
  taskId: string,
  onQuota: (quota: Quota) => void,
): Promise<TaskStatus> => {
  let result = await client.taskStatus(taskId, WAIT_SECONDS)
  onQuota(result.quota)
  let rounds = 0
  while (
    (result.data.status === "pending" || result.data.status === "processing") &&
    rounds < MAX_POLL_ROUNDS
  ) {
    rounds += 1
    result = await client.taskStatus(taskId, WAIT_SECONDS)
    onQuota(result.quota)
  }
  return result.data
}

export const compressCommand = async (
  context: Context,
  options: CompressOptions,
): Promise<number> => {
  const key = await resolveApiKey(context.env)
  if (!key) throw new UsageError(`未登录，请先运行 lubanpng login 或设置 ${API_KEY_ENV}`)

  const client = new ApiClient({ baseUrl: context.apiBase, apiKey: key })
  const me = await client.me()
  const period = me.data.plan.period
  let remaining = me.quota.remaining ?? me.data.quota.remaining
  const onQuota = (quota: Quota): void => {
    if (quota.remaining !== null) remaining = quota.remaining
  }

  const files = await collectFiles(options.paths, options.recursive)
  if (files.length === 0) {
    throw new UsageError(`没有找到可压缩的图片（支持 ${SUPPORTED_FORMATS_LABEL}）`)
  }
  assertNoTargetConflicts(files, options)

  const nameWidth = Math.max(...files.map((file) => file.name.length))
  const printOutcome = (outcome: FileOutcome): void => {
    const name = outcome.file.name.padEnd(nameWidth)
    const pair = formatSizePair(outcome.originalSize, outcome.compressedSize)
    const original = pair.original.padStart(SIZE_COLUMN)
    if (!outcome.ok) {
      context.io.write(`  ${name}  ${original} → 失败：${outcome.error ?? "压缩失败"}\n`)
      return
    }
    const compressed = pair.compressed.padStart(SIZE_COLUMN)
    if (outcome.retained) {
      context.io.write(`  ${name}  ${original} → ${compressed}   无收益，保留原图\n`)
      return
    }
    const percent = savingsPercent(outcome.originalSize, outcome.compressedSize)
    const converted = outcome.converted === null ? "" : `   → ${outcome.converted}`
    context.io.write(`  ${name}  ${original} → ${compressed}   ${formatSavings(percent)}${converted}\n`)
  }

  const processOne = async (file: Collected): Promise<FileOutcome> => {
    const originalSize = (await stat(file.path)).size
    const failure = (error: string): FileOutcome => ({
      file,
      ok: false,
      retained: false,
      converted: null,
      originalSize,
      compressedSize: 0,
      error,
    })
    try {
      const upload = await client.uploadImage(file.path, {
        convert: options.convert,
        background: options.background,
      })
      onQuota(upload.quota)
      const view = await waitForCompletion(client, upload.data.task_id, onQuota)
      if (view.status !== "completed" || view.compressed_url === null) {
        return failure(view.error_msg ?? "压缩失败")
      }
      if (options.inPlace && view.compressed_size !== null && view.compressed_size >= originalSize) {
        return { file, ok: true, retained: true, converted: null, originalSize, compressedSize: view.compressed_size, error: null }
      }
      const bytes = await client.download(view.compressed_url)
      const compressedSize = view.compressed_size ?? bytes.byteLength
      if (options.inPlace && compressedSize >= originalSize) {
        return { file, ok: true, retained: true, converted: null, originalSize, compressedSize, error: null }
      }
      const outputFormat = view.output_format ?? options.convert ?? null
      const target = outputPathFor(file, options, outputFormat)
      await mkdir(dirname(target), { recursive: true })
      await writeFileAtomic(target, bytes)
      const converted = view.target_format === null || view.target_format === undefined ? null : basename(target)
      return { file, ok: true, retained: false, converted, originalSize, compressedSize, error: null }
    } catch (error) {
      return failure(describeError(error))
    }
  }

  const outcomes: FileOutcome[] = []
  await runPool(files, options.concurrency, async (file) => {
    const outcome = await processOne(file)
    outcomes.push(outcome)
    printOutcome(outcome)
  })

  const succeeded = outcomes.filter((outcome) => outcome.ok)
  const failed = outcomes.filter((outcome) => !outcome.ok)
  const retained = outcomes.filter((outcome) => outcome.retained)
  const saved = succeeded.reduce(
    (total, outcome) =>
      outcome.retained ? total : total + Math.max(0, outcome.originalSize - outcome.compressedSize),
    0,
  )
  const parts = [
    `本次 ${succeeded.length} 张`,
    `节省 ${formatBytes(saved)}`,
    `${periodNoun(period)}剩余 ${remaining} 次`,
  ]
  const converted = outcomes.filter((outcome) => outcome.converted !== null)
  if (converted.length > 0) parts.push(`${converted.length} 张已转换`)
  if (retained.length > 0) parts.push(`${retained.length} 张无收益保留原图`)
  if (failed.length > 0) parts.push(`${failed.length} 张失败`)
  context.io.write(`  ${parts.join("，")}\n`)

  return failed.length > 0 || succeeded.length === 0 ? 1 : 0
}
