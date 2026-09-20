import type { GatewayConfig } from "./config.ts";

export interface QuotaHeaders {
  limit?: number;
  remaining?: number;
  reset?: string;
}

export class UpstreamError extends Error {
  readonly status: number;
  readonly code: number;
  readonly data: unknown;
  readonly retryAfter?: number;
  readonly quota: QuotaHeaders;

  constructor(init: {
    status: number;
    code: number;
    message: string;
    data?: unknown;
    retryAfter?: number;
    quota?: QuotaHeaders;
  }) {
    super(init.message);
    this.name = "UpstreamError";
    this.status = init.status;
    this.code = init.code;
    this.data = init.data ?? null;
    this.retryAfter = init.retryAfter;
    this.quota = init.quota ?? {};
  }
}

export interface UpstreamResult<T> {
  data: T;
  quota: QuotaHeaders;
}

export interface SubjectSession {
  cookie?: string;
  apiKey?: string;
}

export interface UploadInput {
  data: Uint8Array;
  filename: string;
  convert?: string;
  background?: string;
}

export interface UpscaleInput {
  data: Uint8Array;
  filename: string;
  scale: "x2" | "x4";
}

export interface TaskView {
  task_id: string;
  status: string;
  progress: number;
  source: string;
  kind: string;
  scale?: string | null;
  original_name: string;
  original_size: number;
  compressed_size?: number | null;
  compressed_url?: string | null;
  target_format?: string | null;
  output_format?: string | null;
  quota_units: number;
  no_gain: boolean;
  error_msg?: string | null;
  created_at: number;
  completed_at?: number | null;
  expires_at?: number | null;
  queue_position?: number | null;
  downloadable: boolean;
}

export interface MeView {
  subject: string;
  email?: string | null;
  plan: {
    id: string;
    name: string;
    period: string;
    quota: number;
    max_file_size: number;
    retention_hours: number;
    max_api_keys: number;
  };
  quota: {
    period_key: string;
    limit: number;
    used: number;
    held: number;
    remaining: number;
    resets_at: string;
  };
}

interface ApiEnvelope<T> {
  code: number;
  msg: string;
  data: T;
}

export interface RequestOptions {
  session: SubjectSession;
  clientIp?: string;
  signal?: AbortSignal;
}

export type CookieSink = (cookie: string) => void;

function readQuota(headers: Headers): QuotaHeaders {
  const quota: QuotaHeaders = {};
  const limit = headers.get("x-quota-limit");
  const remaining = headers.get("x-quota-remaining");
  const reset = headers.get("x-quota-reset");
  if (limit !== null) {
    const parsed = Number.parseInt(limit, 10);
    if (Number.isFinite(parsed)) quota.limit = parsed;
  }
  if (remaining !== null) {
    const parsed = Number.parseInt(remaining, 10);
    if (Number.isFinite(parsed)) quota.remaining = parsed;
  }
  if (reset !== null) quota.reset = reset;
  return quota;
}

function readSetCookie(headers: Headers): string | undefined {
  const raw = headers.get("set-cookie");
  if (!raw) return undefined;
  const pair = raw.split(";")[0]?.trim();
  return pair && pair.includes("=") ? pair : undefined;
}

function applySubjectHeaders(headers: Headers, options: RequestOptions): void {
  if (options.session.cookie) {
    headers.set("cookie", options.session.cookie);
  }
  if (options.session.apiKey) {
    headers.set("authorization", `Bearer ${options.session.apiKey}`);
  } else {
    headers.set("x-requested-with", "LubanPNG");
  }
  if (options.clientIp) {
    headers.set("x-client-ip", options.clientIp);
  }
}

export class LubanPngClient {
  constructor(private readonly config: GatewayConfig) {}

  private url(path: string): string {
    return new URL(path, this.config.upstreamUrl).toString();
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    options: RequestOptions,
    onCookie?: CookieSink,
  ): Promise<UpstreamResult<T>> {
    const headers = new Headers(init.headers);
    applySubjectHeaders(headers, options);
    const response = await fetch(this.url(path), {
      ...init,
      headers,
      signal: options.signal,
    });
    const cookie = readSetCookie(response.headers);
    if (cookie && onCookie) onCookie(cookie);
    const quota = readQuota(response.headers);
    const text = await response.text();
    let envelope: ApiEnvelope<T> | undefined;
    if (text.length > 0) {
      try {
        envelope = JSON.parse(text) as ApiEnvelope<T>;
      } catch {
        envelope = undefined;
      }
    }
    if (!response.ok) {
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfter =
        retryAfterHeader !== null && Number.isFinite(Number.parseInt(retryAfterHeader, 10))
          ? Number.parseInt(retryAfterHeader, 10)
          : undefined;
      throw new UpstreamError({
        status: response.status,
        code: envelope?.code ?? response.status,
        message: envelope?.msg ?? `upstream returned ${response.status}`,
        data: envelope?.data ?? null,
        retryAfter,
        quota,
      });
    }
    if (!envelope) {
      throw new UpstreamError({
        status: response.status,
        code: 2001,
        message: "upstream returned an unreadable payload",
        quota,
      });
    }
    return { data: envelope.data, quota };
  }

  private multipart(input: UploadInput | UpscaleInput): FormData {
    const form = new FormData();
    form.append("file", new Blob([input.data]), input.filename);
    if ("convert" in input && input.convert) form.append("convert", input.convert);
    if ("convert" in input && input.background) form.append("background", input.background);
    if ("scale" in input) form.append("scale", input.scale);
    return form;
  }

  compress(
    input: UploadInput,
    options: RequestOptions,
    onCookie?: CookieSink,
  ): Promise<UpstreamResult<{ task_id: string }>> {
    return this.request(
      "/v1/images/compress",
      { method: "POST", body: this.multipart(input), headers: { accept: "application/json" } },
      options,
      onCookie,
    );
  }

  upscale(
    input: UpscaleInput,
    options: RequestOptions,
    onCookie?: CookieSink,
  ): Promise<UpstreamResult<{ task_id: string }>> {
    return this.request(
      "/v1/images/upscale",
      { method: "POST", body: this.multipart(input), headers: { accept: "application/json" } },
      options,
      onCookie,
    );
  }

  taskStatus(
    taskId: string,
    waitSeconds: number,
    options: RequestOptions,
    onCookie?: CookieSink,
  ): Promise<UpstreamResult<TaskView>> {
    const wait = Math.max(0, Math.min(waitSeconds, this.config.statusWaitMaxSeconds));
    const path = `/v1/images/compress/${encodeURIComponent(taskId)}?wait=${wait}`;
    return this.request(path, { method: "GET", headers: { accept: "application/json" } }, options, onCookie);
  }

  me(options: RequestOptions, onCookie?: CookieSink): Promise<UpstreamResult<MeView>> {
    return this.request("/v1/me", { method: "GET", headers: { accept: "application/json" } }, options, onCookie);
  }

  tasks(options: RequestOptions, onCookie?: CookieSink): Promise<UpstreamResult<TaskView[]>> {
    return this.request("/v1/me/tasks", { method: "GET", headers: { accept: "application/json" } }, options, onCookie);
  }

  downloadUrl(taskId: string, extension: string): string {
    return new URL(`/v1/images/download/${encodeURIComponent(taskId)}.${extension}`, this.config.publicBaseUrl).toString();
  }
}

export function extensionFor(task: TaskView): string {
  if (task.output_format) return task.output_format === "jpeg" ? "jpg" : task.output_format;
  const name = task.original_name;
  const dot = name.lastIndexOf(".");
  const raw = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "bin";
  return raw === "jpeg" ? "jpg" : raw;
}
