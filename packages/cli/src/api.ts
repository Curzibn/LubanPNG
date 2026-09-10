import { readFile } from "node:fs/promises"
import { basename } from "node:path"
import { ApiError } from "./errors.js"
import { VERSION } from "./version.js"

export const DEFAULT_API_BASE = "https://lubanpng.wizthink.cn"
export const API_BASE_ENV = "LUBANPNG_API_BASE"
export const USER_AGENT = `lubanpng-cli/${VERSION}`

export const ErrorCode = {
  network: -1,
  invalidParams: 1001,
  fileTooLarge: 1004,
  internal: 2001,
  compressionFailed: 2002,
  serviceUnconfigured: 2003,
  notFound: 3003,
  unauthorized: 4001,
  missingCsrfHeader: 4002,
  quotaExhausted: 4003,
} as const

export type Plan = {
  id: string
  name: string
  period: string
  quota: number
  max_file_size: number
  retention_hours: number
  max_api_keys: number
}

export type Me = {
  subject: "account" | "device"
  email: string | null
  plan: Plan
  quota: {
    period_key: string
    limit: number
    used: number
    held: number
    remaining: number
    resets_at: string
  }
}

export type UploadResult = { task_id: string }

export type UploadOptions = { convert?: string | undefined; background?: string | undefined }

export type TaskStatus = {
  task_id: string
  status: "pending" | "processing" | "completed" | "failed"
  progress: number
  source: string
  original_name: string
  original_size: number
  compressed_size: number | null
  compressed_url: string | null
  target_format: string | null
  output_format: string | null
  quota_units: number
  error_msg: string | null
  created_at: number
  completed_at: number | null
  expires_at: number | null
  queue_position: number | null
  downloadable: boolean
}

export type Quota = {
  limit: number | null
  remaining: number | null
  resetsAt: string | null
}

export type ApiResult<T> = { data: T; quota: Quota }

type Envelope<T> = { code: number; msg: string; data: T }

type HeaderReader = (name: string) => string | null

const isEnvelope = (value: unknown): value is Envelope<unknown> =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { code?: unknown }).code === "number" &&
  typeof (value as { msg?: unknown }).msg === "string"

const readNumberHeader = (read: HeaderReader, name: string): number | null => {
  const raw = read(name)
  if (raw === null || raw.trim() === "") return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

export const readQuotaHeaders = (read: HeaderReader): Quota => ({
  limit: readNumberHeader(read, "X-Quota-Limit"),
  remaining: readNumberHeader(read, "X-Quota-Remaining"),
  resetsAt: read("X-Quota-Reset"),
})

type RequestOptions = {
  json?: unknown
  formData?: FormData
  signal?: AbortSignal
}

export class ApiClient {
  private readonly baseUrl: string
  private readonly apiKey: string | null
  private readonly fetchImpl: typeof fetch

  constructor(options: { baseUrl: string; apiKey?: string | null; fetchImpl?: typeof fetch }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "")
    this.apiKey = options.apiKey && options.apiKey !== "" ? options.apiKey : null
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
  }

  private url(path: string): string {
    if (/^https?:\/\//i.test(path)) return path
    return `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`
  }

  private headers(json: boolean): Headers {
    const headers = new Headers({ Accept: "application/json", "User-Agent": USER_AGENT })
    if (this.apiKey) headers.set("Authorization", `Bearer ${this.apiKey}`)
    if (json) headers.set("Content-Type", "application/json")
    return headers
  }

  private async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
    let response: Response
    try {
      response = await this.fetchImpl(this.url(path), {
        method,
        headers: this.headers(options.json !== undefined),
        body: options.formData ?? (options.json === undefined ? null : JSON.stringify(options.json)),
        signal: options.signal ?? null,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error
      throw new ApiError(0, ErrorCode.network, "网络错误，无法连接 LubanPNG 服务")
    }
    const text = await response.text()
    const quota = readQuotaHeaders((name) => response.headers.get(name))
    let parsed: unknown
    try {
      parsed = text === "" ? null : JSON.parse(text)
    } catch {
      throw new ApiError(response.status, ErrorCode.network, "服务返回了无法解析的响应")
    }
    if (!isEnvelope(parsed)) {
      throw new ApiError(response.status, ErrorCode.network, "服务返回了无法解析的响应")
    }
    if (response.ok && parsed.code === 0) return { data: parsed.data as T, quota }
    throw new ApiError(response.status, parsed.code, parsed.msg)
  }

  me(signal?: AbortSignal): Promise<ApiResult<Me>> {
    return this.request<Me>("GET", "/v1/me", { signal })
  }

  async uploadImage(
    filePath: string,
    options: UploadOptions = {},
    signal?: AbortSignal,
  ): Promise<ApiResult<UploadResult>> {
    const data = await readFile(filePath)
    const form = new FormData()
    if (options.convert !== undefined) form.append("convert", options.convert)
    if (options.background !== undefined) form.append("background", options.background)
    form.append("file", new Blob([new Uint8Array(data)]), basename(filePath))
    return this.request<UploadResult>("POST", "/v1/images/compress", { formData: form, signal })
  }

  taskStatus(taskId: string, waitSeconds: number, signal?: AbortSignal): Promise<ApiResult<TaskStatus>> {
    return this.request<TaskStatus>(
      "GET",
      `/v1/images/compress/${encodeURIComponent(taskId)}?wait=${waitSeconds}`,
      { signal },
    )
  }

  async download(pathOrUrl: string, signal?: AbortSignal): Promise<Uint8Array> {
    let response: Response
    try {
      response = await this.fetchImpl(this.url(pathOrUrl), {
        method: "GET",
        headers: this.headers(false),
        signal: signal ?? null,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error
      throw new ApiError(0, ErrorCode.network, "下载产物失败，网络错误")
    }
    if (!response.ok) {
      const text = await response.text()
      try {
        const parsed: unknown = text === "" ? null : JSON.parse(text)
        if (isEnvelope(parsed)) throw new ApiError(response.status, parsed.code, parsed.msg)
      } catch (error) {
        if (error instanceof ApiError) throw error
      }
      throw new ApiError(response.status, ErrorCode.network, "下载产物失败")
    }
    return new Uint8Array(await response.arrayBuffer())
  }
}

export const describeError = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.code === ErrorCode.unauthorized) return "API Key 无效或已吊销，请重新运行 lubanpng login"
    if (error.code === ErrorCode.quotaExhausted) return `本期额度已用尽${error.message ? `：${error.message}` : ""}`
    if (error.code === ErrorCode.notFound) return "任务或产物不存在、已过期"
    if (error.code === ErrorCode.network) return error.message
    return error.message !== "" ? error.message : "请求失败"
  }
  if (error instanceof Error && error.message !== "") return error.message
  return "请求失败"
}
