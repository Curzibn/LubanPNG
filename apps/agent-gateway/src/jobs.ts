import type { GatewayConfig } from "./config.ts";
import {
  extensionFor,
  LubanPngClient,
  type RequestOptions,
  type TaskView,
  type UploadInput,
  type UpscaleInput,
} from "./lubanpng-client.ts";

export type JobKind = "compress" | "upscale";

export interface JobOutcome {
  task: TaskView;
  billable: boolean;
  downloadUrl: string | null;
  quotaRemaining?: number;
}

export interface JobPayload extends Record<string, unknown> {
  task_id: string;
  status: string;
  kind: string;
  original_name: string;
  original_bytes: number;
  compressed_bytes: number | null;
  savings_ratio: number | null;
  output_format: string | null;
  target_format: string | null;
  scale: string | null;
  quota_units: number;
  no_gain: boolean;
  error_msg: string | null;
  queue_position: number | null;
  downloadable: boolean;
  download_url: string | null;
  expires_at: number | null;
  created_at: number;
  completed_at: number | null;
}

export function downloadUrlFor(client: LubanPngClient, task: TaskView): string | null {
  if (!task.downloadable) return null;
  return client.downloadUrl(task.task_id, extensionFor(task));
}

export function isBillable(task: TaskView): boolean {
  return task.status === "completed" && !task.no_gain;
}

export function jobPayload(outcome: {
  task: TaskView;
  downloadUrl: string | null;
  billable: boolean;
  completed?: boolean;
}): JobPayload {
  const { task, downloadUrl } = outcome;
  const compressed = task.compressed_size ?? null;
  return {
    task_id: task.task_id,
    status: task.status,
    kind: task.kind,
    original_name: task.original_name,
    original_bytes: task.original_size,
    compressed_bytes: compressed,
    savings_ratio:
      compressed !== null && task.original_size > 0
        ? Number((1 - compressed / task.original_size).toFixed(4))
        : null,
    output_format: task.output_format ?? null,
    target_format: task.target_format ?? null,
    scale: task.scale ?? null,
    quota_units: task.quota_units,
    no_gain: task.no_gain,
    error_msg: task.error_msg ?? null,
    queue_position: task.queue_position ?? null,
    downloadable: task.downloadable,
    download_url: downloadUrl,
    expires_at: task.expires_at ?? null,
    created_at: task.created_at,
    completed_at: task.completed_at ?? null,
  };
}

function isRunning(task: TaskView): boolean {
  return task.status === "pending" || task.status === "processing";
}

async function waitForTask(
  client: LubanPngClient,
  config: GatewayConfig,
  taskId: string,
  options: RequestOptions,
  onCookie?: (cookie: string) => void,
): Promise<{ task: TaskView; quotaRemaining?: number }> {
  const deadline = Date.now() + config.upstreamTimeoutMs;
  let current = await client.taskStatus(taskId, config.statusWaitMaxSeconds, options, onCookie);
  while (isRunning(current.data) && Date.now() < deadline) {
    current = await client.taskStatus(taskId, config.statusWaitMaxSeconds, options, onCookie);
  }
  return { task: current.data, quotaRemaining: current.quota.remaining };
}

export async function submitAndWait(
  config: GatewayConfig,
  client: LubanPngClient,
  submit: (options: RequestOptions) => Promise<{ task_id: string }>,
  options: RequestOptions,
  onCookie?: (cookie: string) => void,
): Promise<JobOutcome> {
  const submitted = await submit(options);
  const settled = await waitForTask(client, config, submitted.task_id, options, onCookie);
  return {
    task: settled.task,
    billable: isBillable(settled.task),
    downloadUrl: downloadUrlFor(client, settled.task),
    quotaRemaining: settled.quotaRemaining,
  };
}

export function runCompress(
  client: LubanPngClient,
  config: GatewayConfig,
  input: UploadInput,
  options: RequestOptions,
  onCookie?: (cookie: string) => void,
): Promise<JobOutcome> {
  return submitAndWait(
    config,
    client,
    (opts) => client.compress(input, opts, onCookie).then((result) => result.data),
    options,
    onCookie,
  );
}

export function runUpscale(
  client: LubanPngClient,
  config: GatewayConfig,
  input: UpscaleInput,
  options: RequestOptions,
  onCookie?: (cookie: string) => void,
): Promise<JobOutcome> {
  return submitAndWait(
    config,
    client,
    (opts) => client.upscale(input, opts, onCookie).then((result) => result.data),
    options,
    onCookie,
  );
}
