import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.ts";
import { LubanPngClient } from "./lubanpng-client.ts";
import { createSessionEntry, type GatewayDeps, type SessionEntry } from "./mcp-server.ts";
import { SessionRegistry } from "./sessions.ts";

const config = loadConfig();
const client = new LubanPngClient(config);
const sessions = new SessionRegistry(config);
const deps: GatewayDeps = { config, client, sessions };
const transports = new Map<string, SessionEntry>();

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
        sessions: sessions.activeSessionCount(),
        anonymous_used_today: sessions.anonymousDailyUsed(),
      });
    }
    if (path === "/mcp" || path === "/mcp/") {
      return await handleMcp(req);
    }
    return json({ code: 3003, msg: "not found", data: null }, 404);
  } catch (error) {
    console.error("unhandled error", path, error);
    return json({ code: 2001, msg: messageOf(error), data: null }, 500);
  }
}

if (import.meta.main) {
  const server = createServer();
  console.log(`agent-gateway listening on :${server.port} -> ${config.upstreamUrl}`);
}
