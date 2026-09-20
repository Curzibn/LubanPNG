import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { HTTPRequestContext, HTTPProcessResult } from "@x402/core/server";
import { loadConfig } from "./config.ts";
import { jobPayload, submitAndWait, type JobKind } from "./jobs.ts";
import { LubanPngClient, type RequestOptions } from "./lubanpng-client.ts";
import { createSessionEntry, type GatewayDeps, type SessionEntry } from "./mcp-server.ts";
import { SessionRegistry } from "./sessions.ts";
import {
  COMPRESS_PATH,
  UPSCALE_PATH,
  initializeX402,
  payerAddressOf,
  requestContext,
  responseFromInstructions,
  settlementAmount,
  type X402Setup,
} from "./x402.ts";

const config = loadConfig();
const client = new LubanPngClient(config);
const sessions = new SessionRegistry(config);
const deps: GatewayDeps = { config, client, sessions };
const transports = new Map<string, SessionEntry>();

let x402: X402Setup | undefined;
let x402Init: Promise<X402Setup> | undefined;
let x402Failure: Error | undefined;

function x402Enabled(): boolean {
  return config.x402Enabled && config.x402PayTo !== "";
}

function ensureX402(): Promise<X402Setup> {
  if (x402) return Promise.resolve(x402);
  if (!x402Init) {
    x402Init = initializeX402(config)
      .then((setup) => {
        x402 = setup;
        x402Failure = undefined;
        console.log("x402 facilitator ready");
        return setup;
      })
      .catch((error: unknown) => {
        x402Init = undefined;
        x402Failure = error instanceof Error ? error : new Error(String(error));
        throw x402Failure;
      });
  }
  return x402Init;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function rpcError(code: number, message: string, status: number): Response {
  return json({ jsonrpc: "2.0", error: { code, message }, id: null }, status);
}

export async function handleMcp(req: Request): Promise<Response> {
  const sessionId = req.headers.get("mcp-session-id");
  if (sessionId) {
    const entry = transports.get(sessionId);
    if (!entry) return rpcError(-32001, "Session not found", 404);
    return entry.transport.handleRequest(req);
  }
  if (req.method !== "POST") {
    return rpcError(-32000, "Bad Request: an Mcp-Session-Id header is required", 400);
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return rpcError(-32700, "Parse error: invalid JSON body", 400);
  }
  if (!isInitializeRequest(body)) {
    return rpcError(-32000, "Bad Request: missing Mcp-Session-Id and the payload is not an initialize request", 400);
  }
  const entry = createSessionEntry(deps, (initialized, created) => {
    transports.set(initialized, created);
    created.transport.onclose = () => {
      transports.delete(initialized);
    };
  });
  await entry.server.connect(entry.transport);
  const response = await entry.transport.handleRequest(req, { parsedBody: body });
  if (entry.transport.sessionId === undefined) {
    await entry.server.close().catch(() => undefined);
  }
  return response;
}

class BadRequest extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

interface PaidInput {
  data: Uint8Array;
  filename: string;
  convert?: string;
  background?: string;
  scale?: "x2" | "x4";
}

async function readPaidInput(req: Request, kind: JobKind): Promise<PaidInput> {
  let form: Awaited<ReturnType<Request["formData"]>>;
  try {
    form = await req.formData();
  } catch {
    throw new BadRequest(400, "expected multipart/form-data with a 'file' field");
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) throw new BadRequest(400, "form field 'file' is required");
  const data = new Uint8Array(await file.arrayBuffer());
  if (data.length === 0) throw new BadRequest(400, "the uploaded file is empty");
  const filename = file instanceof File && file.name !== "" ? file.name : "image.png";
  if (kind === "upscale") {
    const scale = String(form.get("scale") ?? "");
    if (scale !== "x2" && scale !== "x4") throw new BadRequest(400, "form field 'scale' must be x2 or x4");
    return { data, filename, scale };
  }
  const convert = form.get("convert");
  const background = form.get("background");
  return {
    data,
    filename,
    convert: typeof convert === "string" && convert.trim() !== "" ? convert.trim() : undefined,
    background: typeof background === "string" && background.trim() !== "" ? background.trim() : undefined,
  };
}

export async function handlePaid(req: Request, kind: JobKind): Promise<Response> {
  if (!x402Enabled()) {
    return json({ code: 2003, msg: "the pay-per-use channel is not configured", data: null }, 503);
  }
  const limit = kind === "compress" ? config.x402CompressDailyLimit : config.x402UpscaleDailyLimit;
  if (sessions.x402DailyUsed(kind) >= limit) {
    return json(
      { code: 2003, msg: `x402 ${kind} daily cap reached`, data: { limit } },
      503,
      { "retry-after": "3600" },
    );
  }

  let setup: X402Setup;
  try {
    setup = await ensureX402();
  } catch (error) {
    return json({ code: 2003, msg: `payment facilitator unavailable: ${messageOf(error)}`, data: null }, 503);
  }

  const path = new URL(req.url).pathname;
  const context: HTTPRequestContext = requestContext(req, path);
  let processed: HTTPProcessResult;
  try {
    processed = await setup.httpServer.processHTTPRequest(context);
  } catch (error) {
    return json({ code: 2002, msg: `payment verification error: ${messageOf(error)}`, data: null }, 502);
  }
  if (processed.type === "payment-error") {
    return responseFromInstructions(processed.response);
  }
  if (processed.type === "no-payment-required") {
    return json({ code: 2001, msg: "route is not payment-protected as expected", data: null }, 500);
  }

  const zeroHeaders = async (): Promise<Record<string, string>> => {
    const settlement = await setup.httpServer.processSettlement(
      processed.paymentPayload,
      processed.paymentRequirements,
      processed.declaredExtensions,
      { request: context },
      { amount: "0" },
      processed.beforeHandlerSettlement,
    );
    if (settlement.success) return settlement.headers;
    return setup.httpServer.createSettlementHeaders({
      success: true,
      transaction: "",
      network: processed.paymentRequirements.network,
      amount: "0",
    });
  };

  let input: PaidInput;
  try {
    input = await readPaidInput(req, kind);
  } catch (error) {
    const status = error instanceof BadRequest ? error.status : 400;
    return json({ code: 1001, msg: messageOf(error), data: { charged: false } }, status, await zeroHeaders());
  }

  const payer = payerAddressOf(processed.paymentPayload) ?? "unknown";
  const subject = sessions.payer(payer);
  const options: RequestOptions = {
    session: { cookie: subject.cookie, apiKey: config.x402ServiceApiKey || undefined },
    clientIp: config.trustClientIp ? (req.headers.get("x-client-ip") ?? undefined) : undefined,
  };
  const bindCookie = (cookie: string): void => {
    sessions.bindPayerCookie(payer, cookie);
  };

  let outcome;
  try {
    outcome = await submitAndWait(
      config,
      client,
      (opts) =>
        kind === "compress"
          ? client
              .compress(
                {
                  data: input.data,
                  filename: input.filename,
                  convert: input.convert,
                  background: input.background,
                },
                opts,
                bindCookie,
              )
              .then((result) => result.data)
          : client
              .upscale({ data: input.data, filename: input.filename, scale: input.scale ?? "x2" }, opts, bindCookie)
              .then((result) => result.data),
      options,
    );
  } catch (error) {
    const headers = await zeroHeaders().catch(() => ({}));
    return json(
      { code: 2002, msg: messageOf(error), data: { charged: false, settlement: "0" } },
      502,
      headers,
    );
  }

  if (outcome.quotaRemaining !== undefined && outcome.quotaRemaining <= 0) {
    sessions.bindPayerCookie(payer, "");
  }

  const billable = outcome.billable;
  const amount = settlementAmount(config, kind, billable);

  let settleHeaders: Record<string, string>;
  try {
    const settlement = await setup.httpServer.processSettlement(
      processed.paymentPayload,
      processed.paymentRequirements,
      processed.declaredExtensions,
      { request: context },
      { amount },
      processed.beforeHandlerSettlement,
    );
    if (!settlement.success) {
      return json(
        {
          code: 2002,
          msg: `settlement failed: ${settlement.errorReason ?? "unknown"}`,
          data: { ...jobPayload(outcome), charged: false, settlement: "0" },
        },
        settlement.response?.status ?? 402,
        settlement.response?.headers ?? settlement.headers,
      );
    }
    settleHeaders = settlement.headers;
  } catch (error) {
    return json(
      { code: 2002, msg: `settlement error: ${messageOf(error)}`, data: { ...jobPayload(outcome), charged: false } },
      502,
      await zeroHeaders().catch(() => ({})),
    );
  }

  if (billable) sessions.noteX402Call(kind);
  const failed = outcome.task.status === "failed";
  const running = outcome.task.status === "pending" || outcome.task.status === "processing";
  return json(
    {
      code: failed ? 2002 : 0,
      msg: failed ? outcome.task.error_msg ?? "job failed" : running ? "job is still running" : "success",
      data: { ...jobPayload(outcome), charged: billable, settlement: amount },
    },
    failed ? 502 : running ? 202 : 200,
    settleHeaders,
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createServer(): ReturnType<typeof Bun.serve> {
  return startServer();
}

function startServer(): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port: config.port,
    idleTimeout: 255,
    maxRequestBodySize: 96 * 1024 * 1024,
    fetch: fetchHandler,
  });
}

async function fetchHandler(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname;
  try {
    if (path === "/healthz") {
      return json({
        ok: true,
        x402: x402Enabled() ? (x402 ? "ready" : x402Failure ? "unavailable" : "initializing") : "disabled",
        sessions: sessions.activeSessionCount(),
        payers: sessions.payerCount(),
        anonymous_used_today: sessions.anonymousDailyUsed(),
        x402_used_today: {
          compress: sessions.x402DailyUsed("compress"),
          upscale: sessions.x402DailyUsed("upscale"),
        },
      });
    }
    if (path === "/mcp" || path === "/mcp/") {
      return await handleMcp(req);
    }
    if (path === COMPRESS_PATH || path === UPSCALE_PATH) {
      const kind: JobKind = path === COMPRESS_PATH ? "compress" : "upscale";
      if (req.method !== "POST") {
        return json({ code: 1001, msg: "method not allowed", data: null }, 405, { allow: "POST" });
      }
      return await handlePaid(req, kind);
    }
    return json({ code: 3003, msg: "not found", data: null }, 404);
  } catch (error) {
    console.error("unhandled error", path, error);
    return json({ code: 2001, msg: messageOf(error), data: null }, 500);
  }
}

if (import.meta.main) {
  if (x402Enabled()) {
    ensureX402().catch((error: unknown) => {
      console.error("x402 facilitator initialize failed; retrying on demand:", messageOf(error));
    });
  }
  const server = createServer();
  console.log(`agent-gateway listening on :${server.port} -> ${config.upstreamUrl} (x402 ${x402Enabled() ? "on" : "off"})`);
}
