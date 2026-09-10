export type Subject = "account" | "device"
export type PlanId = "anonymous" | "free"
export type QuotaPeriod = "day" | "month"

export type Plan = {
  id: PlanId
  name: string
  period: QuotaPeriod
  quota: number
  max_file_size: number
  retention_hours: number
  max_api_keys: number
}

export type Quota = {
  period_key: string
  limit: number
  used: number
  held: number
  remaining: number
  resets_at: string
}

export type Me = {
  subject: Subject
  email: string | null
  plan: Plan
  quota: Quota
}

export type OtpRequested = {
  sent: boolean
  expires_in: number
  resend_after: number
}

export type VerifiedSession = {
  email: string
  plan_id: PlanId
  created: boolean
}

export type ApiKey = {
  id: string
  name: string
  prefix: string
  suffix: string
  created_at: string
  last_used_at: string | null
}

export type CreatedApiKey = {
  id: string
  name: string
  key: string
  prefix: string
  suffix: string
  created_at: string
}

export type TaskStatus = "pending" | "processing" | "completed" | "failed"
export type TaskSource = "web" | "api" | "cli"

export type TaskRecord = {
  task_id: string
  status: TaskStatus
  source: TaskSource
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
  downloadable: boolean
}

export type CompressTask = {
  task_id: string
  status: TaskStatus
  progress: number
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
}

export type QuotaHeaders = {
  limit: number | null
  remaining: number | null
  resetsAt: string | null
}

export type ApiResult<T> = {
  data: T
  quota: QuotaHeaders
}

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

export class ApiError extends Error {
  readonly status: number
  readonly code: number
  readonly data: unknown

  constructor(status: number, code: number, message: string, data: unknown = null) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.data = data
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError

export const errorMessage = (error: unknown, fallback: string): string => {
  if (isApiError(error)) return error.message || fallback
  if (error instanceof Error && error.message) return fallback
  return fallback
}

type Envelope<T> = { code: number; msg: string; data: T }

type HeaderReader = (name: string) => string | null

const CSRF_HEADER_NAME = "X-Requested-With"
const CSRF_HEADER_VALUE = "LubanPNG"
const NETWORK_FAILURE_MESSAGE = "网络错误，请检查连接后重试"
const UNREADABLE_RESPONSE_MESSAGE = "服务暂时不可用，请稍后再试"

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

export const readQuotaHeaders = (read: HeaderReader): QuotaHeaders => ({
  limit: readNumberHeader(read, "X-Quota-Limit"),
  remaining: readNumberHeader(read, "X-Quota-Remaining"),
  resetsAt: read("X-Quota-Reset"),
})

const parseEnvelope = <T>(status: number, text: string, read: HeaderReader): ApiResult<T> => {
  let parsed: unknown
  try {
    parsed = text === "" ? null : JSON.parse(text)
  } catch {
    throw new ApiError(status, ErrorCode.network, UNREADABLE_RESPONSE_MESSAGE)
  }
  if (!isEnvelope(parsed)) {
    throw new ApiError(status, ErrorCode.network, UNREADABLE_RESPONSE_MESSAGE)
  }
  if (status >= 200 && status < 300 && parsed.code === 0) {
    return { data: parsed.data as T, quota: readQuotaHeaders(read) }
  }
  throw new ApiError(status, parsed.code, parsed.msg, parsed.data)
}

type RequestOptions = {
  json?: unknown
  signal?: AbortSignal
  keepalive?: boolean
}

const request = async <T>(method: string, path: string, options: RequestOptions = {}): Promise<ApiResult<T>> => {
  const headers = new Headers({ Accept: "application/json" })
  if (method !== "GET") headers.set(CSRF_HEADER_NAME, CSRF_HEADER_VALUE)
  if (options.json !== undefined) headers.set("Content-Type", "application/json")
  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: "include",
      body: options.json === undefined ? null : JSON.stringify(options.json),
      signal: options.signal ?? null,
      keepalive: options.keepalive ?? false,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new ApiError(0, ErrorCode.network, NETWORK_FAILURE_MESSAGE)
  }
  const text = await response.text()
  return parseEnvelope<T>(response.status, text, (name) => response.headers.get(name))
}

export const fetchMe = (signal?: AbortSignal): Promise<ApiResult<Me>> => request<Me>("GET", "/v1/me", { signal })

export const requestOtp = async (email: string): Promise<OtpRequested> =>
  (await request<OtpRequested>("POST", "/v1/auth/otp", { json: { email } })).data

export const verifyOtp = async (email: string, code: string): Promise<VerifiedSession> =>
  (await request<VerifiedSession>("POST", "/v1/auth/verify", { json: { email, code } })).data

export const logout = async (): Promise<void> => {
  await request<{ ok: boolean }>("POST", "/v1/auth/logout")
}

export const listApiKeys = async (): Promise<ApiKey[]> => (await request<ApiKey[]>("GET", "/v1/me/api-keys")).data

export const createApiKey = async (name: string): Promise<CreatedApiKey> =>
  (await request<CreatedApiKey>("POST", "/v1/me/api-keys", { json: { name } })).data

export const revokeApiKey = async (id: string): Promise<void> => {
  await request<{ ok: boolean }>("DELETE", `/v1/me/api-keys/${encodeURIComponent(id)}`)
}

export const listTasks = async (): Promise<TaskRecord[]> => (await request<TaskRecord[]>("GET", "/v1/me/tasks")).data

export type WaitlistPlanId = "pro" | "metered"

export const joinWaitlist = async (planId: WaitlistPlanId): Promise<void> => {
  await request<{ plan_id: string; created_at: string }>("POST", "/v1/me/waitlist", {
    json: { plan_id: planId },
  })
}

export type VisitPayload = {
  path: string
  referrer_host: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
}

export const reportVisit = async (payload: VisitPayload): Promise<void> => {
  await request<{ ok: boolean }>("POST", "/v1/events/visit", { json: payload, keepalive: true })
}

export const fetchTask = (taskId: string, waitSeconds: number, signal?: AbortSignal): Promise<ApiResult<CompressTask>> =>
  request<CompressTask>("GET", `/v1/images/compress/${encodeURIComponent(taskId)}?wait=${waitSeconds}`, { signal })

export type UploadOptions = {
  convert?: string | null
  background?: string | null
  onProgress?: (ratio: number) => void
  signal?: AbortSignal
}

export const uploadImage = (file: File, options: UploadOptions = {}): Promise<ApiResult<{ task_id: string }>> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/v1/images/compress")
    xhr.withCredentials = true
    xhr.setRequestHeader(CSRF_HEADER_NAME, CSRF_HEADER_VALUE)
    xhr.setRequestHeader("Accept", "application/json")
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) options.onProgress?.(event.loaded / event.total)
    }
    xhr.onload = () => {
      try {
        resolve(parseEnvelope<{ task_id: string }>(xhr.status, xhr.responseText, (name) => xhr.getResponseHeader(name)))
      } catch (error) {
        reject(error)
      }
    }
    xhr.onerror = () => reject(new ApiError(0, ErrorCode.network, NETWORK_FAILURE_MESSAGE))
    xhr.onabort = () => reject(new DOMException("上传已取消", "AbortError"))
    options.signal?.addEventListener("abort", () => xhr.abort(), { once: true })
    const form = new FormData()
    if (options.convert) form.append("convert", options.convert)
    if (options.background) form.append("background", options.background)
    form.append("file", file, file.name)
    xhr.send(form)
  })

export const fetchCompressedBlob = async (url: string): Promise<Blob> => {
  const response = await fetch(url, { credentials: "include" })
  if (!response.ok) throw new ApiError(response.status, ErrorCode.network, "下载失败")
  return response.blob()
}
