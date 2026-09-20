import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { GatewayConfig } from "./config.ts";
import { runCompress, runUpscale, downloadUrlFor } from "./jobs.ts";
import {
  LubanPngClient,
  type RequestOptions,
  type TaskView,
  UpstreamError,
} from "./lubanpng-client.ts";
import { SessionRegistry, type TaskKind } from "./sessions.ts";

export interface GatewayDeps {
  config: GatewayConfig;
  client: LubanPngClient;
  sessions: SessionRegistry;
}

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

const UPSCALE_DESCRIPTION = [
  "Upscale a PNG or JPEG image by 2x or 4x with a super-resolution model; the output is always a PNG.",
  "Input limits: PNG or JPEG only, at most 2.25 megapixels, no side above 2048 px, at most 20 MiB.",
  "Output is capped at 64 MiB. Requests may queue behind other upscale jobs; a full queue fails with HTTP 429 and a retry_after hint.",
  "A failed, timed-out or invalid upscale is never billed. Upscaling has no no_gain case because the result is always larger than the input.",
  "Upscale output is kept for 24 hours; call get_task to fetch the download link again.",
].join(" ");

const COMPRESS_DESCRIPTION = [
  "Compress a PNG, JPEG, GIF, WebP or AVIF image, optionally converting it to png, jpeg, webp or avif.",
  "One call submits the job, waits for it to finish and returns the result with a download link.",
  "Billing: a job is charged only when it produces a smaller file (convert adds one extra unit). A result that is not smaller is reported with no_gain=true and costs nothing; failed jobs are free.",
  "Compressed output is kept for 24 hours; call get_task to fetch the download link again.",
  "If the session runs out of calls, the error explains how to continue: wait for the daily reset, configure an lp_api_key, or use the pay-per-use endpoint.",
].join(" ");

function ok(text: string, structured?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

function fail(text: string, structured?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    isError: true,
    ...(structured ? { structuredContent: structured } : {}),
  };
}

function upgradeHint(config: GatewayConfig): string {
  return [
    `Options: (a) retry after the reset time shown by check_quota,`,
    `(b) configure the MCP server with an lp_api_key to use that account's monthly quota (register at ${config.publicBaseUrl}),`,
    `(c) call the pay-per-use endpoint POST ${config.publicBaseUrl}/v1/agent/compress, which settles on-chain only for successful compressions.`,
  ].join(" ");
}

function errorPayload(error: unknown, config: GatewayConfig, kind: TaskKind): Record<string, unknown> {
  if (error instanceof UpstreamError) {
    const quota = error.quota;
    let message = error.message;
    if (error.status === 429) {
      message =
        kind === "compress"
          ? `Quota exhausted for this subject. ${upgradeHint(config)}`
          : `Upscale quota exhausted for this subject. ${upgradeHint(config)}`;
    } else if (error.status === 413) {
      message = `The file is larger than the allowed upload size: ${error.message}`;
    } else if (error.status === 503) {
      message = `The upscale backend is unavailable right now: ${error.message}`;
    }
    return {
      error: {
        status: error.status,
        code: error.code,
        message,
        ...(error.retryAfter !== undefined ? { retry_after: error.retryAfter } : {}),
        ...(error.data ? { detail: error.data } : {}),
        ...(quota.limit !== undefined && quota.remaining !== undefined ? { quota } : {}),
      },
    };
  }
  return {
    error: {
      status: 500,
      code: 2001,
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

function taskPayload(task: TaskView, downloadUrl: string | null): Record<string, unknown> {
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

function decodeBase64(input: string): Uint8Array {
  const trimmed = input.trim();
  const payload = trimmed.startsWith("data:") ? trimmed.slice(trimmed.indexOf(",") + 1) : trimmed;
  const bytes = Buffer.from(payload, "base64");
  if (bytes.length === 0) throw new Error("image_base64 decoded to zero bytes");
  return new Uint8Array(bytes);
}

function sessionIdOf(extra: Extra): string {
  const sessionId = extra.sessionId;
  if (!sessionId) {
    throw new Error("This gateway needs a stateful MCP session, but the request carried no session id.");
  }
  return sessionId;
}

function clientIpOf(extra: Extra): string | undefined {
  const headers = extra.requestInfo?.headers as Record<string, string | string[] | undefined> | undefined;
  const raw = headers?.["x-client-ip"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function buildServer(deps: GatewayDeps): McpServer {
  const { config, client, sessions } = deps;

  const server = new McpServer(
    { name: "lubanpng-agent-gateway", version: "0.1.0" },
    {
      instructions: [
        "LubanPNG compresses and upscales images.",
        "compress_image and upscale_image submit a job, wait for it and return the result with a download link.",
        `Anonymous use is limited to ${config.sessionQuotaLimit} compress calls and ${config.sessionUpscaleLimit} upscale call per MCP session; check_quota reports the remaining budget and reset time.`,
        "A compression that produces no smaller file is free; a failed upscale is free.",
      ].join(" "),
    },
  );

  const optionsFor = (extra: Extra): RequestOptions => {
    const state = sessions.session(sessionIdOf(extra));
    return {
      session: { cookie: state.cookie, apiKey: state.apiKey },
      clientIp: clientIpOf(extra),
      signal: extra.signal,
    };
  };

  const bindCookie = (extra: Extra, cookie: string): void => {
    sessions.bindCookie(sessionIdOf(extra), cookie);
  };

  const reserveOrFail = (extra: Extra, kind: TaskKind) => {
    const sessionId = sessionIdOf(extra);
    const verdict = sessions.reserve(sessionId, kind);
    if (verdict.allowed) return null;
    if (verdict.reason === "anonymous_daily_breaker") {
      return fail(
        `This gateway's anonymous pool is closed for today (${verdict.limit} calls/day). The pay-per-use endpoint POST ${config.publicBaseUrl}/v1/agent/compress is unaffected.`,
        { error: { status: 503, code: 2003, message: "anonymous daily breaker tripped", limit: verdict.limit } },
      );
    }
    const guidance = upgradeHint(config);
    return fail(
      `This MCP session has used its ${kind} allowance (${verdict.limit}). ${guidance}`,
      {
        error: {
          status: 429,
          code: 4003,
          message: `session ${kind} quota exhausted`,
          session_limit: verdict.limit,
        },
      },
    );
  };

  const summarize = (kind: TaskKind, task: TaskView, downloadUrl: string | null): string => {
    if (task.status === "failed") {
      return `The ${kind} job failed${task.error_msg ? `: ${task.error_msg}` : ""}. It was not billed.`;
    }
    if (!task.downloadable) {
      return `The ${kind} job is still running. Call get_task with task_id ${task.task_id} later; it has not been billed yet.`;
    }
    const result = task.no_gain
      ? `No smaller file was produced, so this call is free.`
      : `Charged ${task.quota_units} quota unit${task.quota_units === 1 ? "" : "s"}.`;
    return `${kind === "compress" ? "Compressed" : "Upscaled"} ${task.original_name}: ${task.original_size} -> ${task.compressed_size} bytes. ${result} Download: ${downloadUrl} (kept for 24h).`;
  };

  server.registerTool(
    "compress_image",
    {
      title: "Compress an image",
      description: COMPRESS_DESCRIPTION,
      inputSchema: {
        image_base64: z.string().describe("Base64-encoded image bytes (PNG, JPEG, GIF, WebP or AVIF); a data: URL prefix is accepted."),
        filename: z.string().optional().describe("Original file name, used to derive the output extension. Defaults to image.png."),
        output_format: z
          .enum(["png", "jpeg", "webp", "avif"])
          .optional()
          .describe("Convert the image to this format. Conversion costs one extra quota unit."),
        background: z
          .string()
          .optional()
          .describe("Background colour such as #ffffff, required when converting a transparent image to JPEG."),
      },
    },
    async (args, extra) => {
      const denied = reserveOrFail(extra, "compress");
      if (denied) return denied;
      const sessionId = sessionIdOf(extra);
      try {
        const outcome = await runCompress(
          client,
          config,
          {
            data: decodeBase64(args.image_base64),
            filename: args.filename ?? "image.png",
            convert: args.output_format,
            background: args.background,
          },
          optionsFor(extra),
          (cookie) => bindCookie(extra, cookie),
        );
        sessions.release(sessionId, "compress", outcome.billable);
        const payload = taskPayload(outcome.task, outcome.downloadUrl);
        const text = summarize("compress", outcome.task, outcome.downloadUrl);
        return outcome.task.status === "failed" ? fail(text, payload) : ok(text, payload);
      } catch (error) {
        sessions.release(sessionId, "compress", false);
        return fail(
          errorPayload(error, config, "compress").error
            ? String((errorPayload(error, config, "compress").error as Record<string, unknown>).message)
            : "compress failed",
          errorPayload(error, config, "compress"),
        );
      }
    },
  );

  server.registerTool(
    "upscale_image",
    {
      title: "Upscale an image",
      description: UPSCALE_DESCRIPTION,
      inputSchema: {
        image_base64: z.string().describe("Base64-encoded PNG or JPEG bytes; a data: URL prefix is accepted."),
        scale: z.enum(["x2", "x4"]).describe("Upscale factor; x4 produces a 4x wider and 4x taller image."),
        filename: z.string().optional().describe("Original file name. Defaults to image.png."),
      },
    },
    async (args, extra) => {
      const denied = reserveOrFail(extra, "upscale");
      if (denied) return denied;
      const sessionId = sessionIdOf(extra);
      try {
        const outcome = await runUpscale(
          client,
          config,
          {
            data: decodeBase64(args.image_base64),
            filename: args.filename ?? "image.png",
            scale: args.scale,
          },
          optionsFor(extra),
          (cookie) => bindCookie(extra, cookie),
        );
        sessions.release(sessionId, "upscale", outcome.billable);
        const payload = taskPayload(outcome.task, outcome.downloadUrl);
        const text = summarize("upscale", outcome.task, outcome.downloadUrl);
        return outcome.task.status === "failed" ? fail(text, payload) : ok(text, payload);
      } catch (error) {
        sessions.release(sessionId, "upscale", false);
        const payload = errorPayload(error, config, "upscale");
        return fail(String((payload.error as Record<string, unknown>).message), payload);
      }
    },
  );

  server.registerTool(
    "check_quota",
    {
      title: "Check the current quota",
      description:
        "Report the subject behind this MCP session, its plan, the remaining quota and the reset time, plus how many calls this session has already used. Anonymous sessions get a small daily allowance; an lp_api_key uses the account's monthly quota.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const state = sessions.session(sessionIdOf(extra));
      try {
        const me = await client.me(optionsFor(extra), (cookie) => bindCookie(extra, cookie));
        const payload = {
          subject: me.data.subject,
          email: me.data.email ?? null,
          plan: me.data.plan.id,
          plan_name: me.data.plan.name,
          period: me.data.plan.period,
          quota_limit: me.data.quota.limit,
          quota_used: me.data.quota.used,
          quota_held: me.data.quota.held,
          quota_remaining: me.data.quota.remaining,
          resets_at: me.data.quota.resets_at,
          max_file_size: me.data.plan.max_file_size,
          retention_hours: me.data.plan.retention_hours,
          session_calls_used: { compress: state.consumed.compress, upscale: state.consumed.upscale },
        };
        return ok(
          `Subject ${payload.subject}${payload.email ? ` (${payload.email})` : ""} on the ${payload.plan} plan: ${payload.quota_remaining} of ${payload.quota_limit} units left, resets at ${payload.resets_at}.`,
          payload,
        );
      } catch (error) {
        const payload = errorPayload(error, config, "compress");
        return fail(String((payload.error as Record<string, unknown>).message), payload);
      }
    },
  );

  server.registerTool(
    "get_task",
    {
      title: "Look up a task",
      description:
        "Fetch one compression or upscale job by task_id, or list the recent jobs for this session's subject. Use it to recover the download link of a job whose first call timed out. Results are kept for 24 hours.",
      inputSchema: {
        task_id: z.string().optional().describe("Task id returned by compress_image or upscale_image."),
      },
    },
    async (args, extra) => {
      try {
        if (args.task_id) {
          const task = await client.taskStatus(args.task_id, 0, optionsFor(extra), (cookie) => bindCookie(extra, cookie));
          const url = downloadUrlFor(client, task.data);
          const payload = taskPayload(task.data, url);
          return ok(`Task ${task.data.task_id} (${task.data.kind}): ${task.data.status}.`, payload);
        }
        const tasks = await client.tasks(optionsFor(extra), (cookie) => bindCookie(extra, cookie));
        const payload = {
          tasks: tasks.data.map((task) => taskPayload(task, downloadUrlFor(client, task))),
        };
        const lines = tasks.data.map(
          (task) =>
            `${task.task_id} ${task.kind} ${task.status}${task.no_gain ? " (no gain, free)" : ""}${task.downloadable ? " (downloadable)" : ""}`,
        );
        return ok(
          tasks.data.length === 0 ? "No tasks yet for this subject." : `Recent tasks:\n${lines.join("\n")}`,
          payload,
        );
      } catch (error) {
        const payload = errorPayload(error, config, "compress");
        return fail(String((payload.error as Record<string, unknown>).message), payload);
      }
    },
  );

  return server;
}

export interface SessionEntry {
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
}

export function createSessionEntry(
  deps: GatewayDeps,
  onInitialized: (sessionId: string, entry: SessionEntry) => void,
): SessionEntry {
  const entry = {} as SessionEntry;
  entry.server = buildServer(deps);
  entry.transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      deps.sessions.session(sessionId);
      onInitialized(sessionId, entry);
    },
  });
  return entry;
}
