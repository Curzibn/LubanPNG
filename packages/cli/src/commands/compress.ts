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
import { clientFor, type Context } from "../context.js"
import { UsageError } from "../errors.js"
import { formatBytes, formatSavings, formatSizePair, savingsPercent } from "../format.js"
import { heicInPlaceMessage, HEIC_EXTENSIONS, isHeicPath, prepareHeicUpload, type PreparedUpload } from "../heic.js"
import { DEFAULT_LANG, translator, type Lang } from "../i18n/messages.js"

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ...HEIC_EXTENSIONS])
const FORMAT_EXTENSIONS: Record<string, string> = { png: ".png", jpeg: ".jpg", gif: ".gif", webp: ".webp", avif: ".avif" }
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
  noGain: boolean
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

export const collectFiles = async (
  inputs: string[],
  recursive: boolean,
  lang: Lang = DEFAULT_LANG,
): Promise<Collected[]> => {
  const t = translator(lang)
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
      throw new UsageError(t("error.pathMissing", { path: input }))
    }
    if (info.isDirectory()) {
      if (!recursive) throw new UsageError(t("error.pathNeedsRecursive", { path: input }))
      await walk(input, input, push)
    } else if (info.isFile()) {
      push({ path: input, name: basename(input), relative: basename(input) })
    } else {
      throw new UsageError(t("error.pathUnsupported", { path: input }))
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

const assertNoTargetConflicts = (files: Collected[], options: CompressOptions, lang: Lang): void => {
  const t = translator(lang)
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
  const detail = conflicts
    .map(([target, sources]) =>
      t("format.conflictItem", { target, sources: sources.join(t("format.sourceSeparator")) }),
    )
    .join(t("format.conflictSeparator"))
  throw new UsageError(t("error.outputConflict", { detail }))
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
  const t = translator(context.lang)
  const key = await resolveApiKey(context.env)
  if (!key) throw new UsageError(t("error.notSignedIn", { env: API_KEY_ENV }))

  const client = clientFor(context, key)
  const me = await client.me()
  const period = me.data.plan.period
  let remaining = me.quota.remaining ?? me.data.quota.remaining
  const onQuota = (quota: Quota): void => {
    if (quota.remaining !== null) remaining = quota.remaining
  }

  const files = await collectFiles(options.paths, options.recursive, context.lang)
  if (files.length === 0) {
    throw new UsageError(t("error.noImages", { formats: t("formats.supported") }))
  }
  assertNoTargetConflicts(files, options, context.lang)

  const nameWidth = Math.max(...files.map((file) => file.name.length))
  const printOutcome = (outcome: FileOutcome): void => {
    const name = outcome.file.name.padEnd(nameWidth)
    const pair = formatSizePair(outcome.originalSize, outcome.compressedSize)
    const original = pair.original.padStart(SIZE_COLUMN)
    if (!outcome.ok) {
      context.io.write(
        `${t("row.failed", { name, original, error: outcome.error ?? t("error.compressionFailed") })}\n`,
      )
      return
    }
    const compressed = pair.compressed.padStart(SIZE_COLUMN)
    if (outcome.noGain) {
      const note =
        outcome.converted === null
          ? t("row.noteNoGain")
          : t("row.noteConvertedNoGain", { file: outcome.converted })
      context.io.write(`${t("row.noGain", { name, original, compressed, note })}\n`)
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
      noGain: false,
      converted: null,
      originalSize,
      compressedSize: 0,
      error,
    })
    let prepared: PreparedUpload = { path: file.path, name: file.name, cleanup: async () => undefined }
    if (isHeicPath(file.path)) {
      if (options.inPlace) return failure(heicInPlaceMessage(context.lang))
      try {
        prepared = await prepareHeicUpload(file.path, process.platform, undefined, context.lang)
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error))
      }
    }
    try {
      const upload = await client.uploadImage(prepared.path, {
        convert: options.convert,
        background: options.background,
      })
      onQuota(upload.quota)
      const view = await waitForCompletion(client, upload.data.task_id, onQuota)
      if (view.status !== "completed" || view.compressed_url === null) {
        return failure(view.error_msg ?? t("error.compressionFailed"))
      }
      if (view.no_gain) {
        if (options.inPlace) {
          const kept = await stat(file.path).catch(() => null)
          const untouched = kept !== null && kept.size === originalSize
          return {
            file,
            ok: untouched,
            noGain: true,
            converted: null,
            originalSize,
            compressedSize: view.compressed_size ?? originalSize,
            error: untouched ? null : t("error.rewritten"),
          }
        }
        const bytes = await client.download(view.compressed_url)
        const compressedSize = view.compressed_size ?? bytes.byteLength
        const outputFormat = view.output_format ?? options.convert ?? null
        const target = outputPathFor(file, options, outputFormat)
        await mkdir(dirname(target), { recursive: true })
        await writeFileAtomic(target, bytes)
        return {
          file,
          ok: true,
          noGain: true,
          converted: view.target_format === null ? null : basename(target),
          originalSize,
          compressedSize,
          error: null,
        }
      }
      const bytes = await client.download(view.compressed_url)
      const compressedSize = view.compressed_size ?? bytes.byteLength
      const outputFormat = view.output_format ?? options.convert ?? null
      const target = outputPathFor(file, options, outputFormat)
      await mkdir(dirname(target), { recursive: true })
      await writeFileAtomic(target, bytes)
      return {
        file,
        ok: true,
        noGain: false,
        converted: view.target_format === null ? null : basename(target),
        originalSize,
        compressedSize,
        error: null,
      }
    } catch (error) {
      return failure(describeError(error, context.lang))
    } finally {
      await prepared.cleanup()
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
  const noGain = outcomes.filter((outcome) => outcome.ok && outcome.noGain)
  const saved = outcomes.reduce(
    (total, outcome) =>
      outcome.ok && !outcome.noGain ? total + Math.max(0, outcome.originalSize - outcome.compressedSize) : total,
    0,
  )
  const parts = [
    t("summary.batch", { count: succeeded.length }),
    t("summary.saved", { size: formatBytes(saved) }),
    t(period === "day" ? "quota.remaining.day" : "quota.remaining.month", { count: remaining }),
  ]
  const converted = outcomes.filter((outcome) => outcome.ok && !outcome.noGain && outcome.converted !== null)
  if (converted.length > 0) parts.push(t("summary.converted", { count: converted.length }))
  const convertedNoGain = noGain.filter((outcome) => outcome.converted !== null)
  if (convertedNoGain.length > 0) parts.push(t("summary.convertedNoGain", { count: convertedNoGain.length }))
  const plainNoGain = noGain.length - convertedNoGain.length
  if (plainNoGain > 0) parts.push(t("summary.noGain", { count: plainNoGain }))
  if (failed.length > 0) parts.push(t("summary.failed", { count: failed.length }))
  context.io.write(`  ${parts.join(t("summary.separator"))}\n`)

  return failed.length > 0 || succeeded.length === 0 ? 1 : 0
}
