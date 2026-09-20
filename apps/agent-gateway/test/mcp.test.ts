import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleMcp } from "../src/main.ts";

const BASE = "http://gateway.test";

async function startClient(): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
  const passthrough = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) =>
      handleMcp(new Request(String(input), init)),
    { preconnect: () => undefined },
  ) as unknown as typeof fetch;
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { fetch: passthrough });
  const client = new Client({ name: "gateway-test", version: "0.0.1" });
  await client.connect(transport);
  return { client, transport };
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
  const first = content[0];
  return first && first.type === "text" && typeof first.text === "string" ? first.text : "";
}

describe("mcp endpoint", () => {
  test("initialize creates a session and lists the four gateway tools", async () => {
    const { client, transport } = await startClient();
    expect(transport.sessionId).toBeTruthy();
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "check_quota",
      "compress_image",
      "get_task",
      "upscale_image",
    ]);
    await client.close();
  });

  test("rejects a non-initialize request without a session id", async () => {
    const response = await handleMcp(
      new Request(`${BASE}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );
    expect(response.status).toBe(400);
  });

  test("rejects an unknown session id", async () => {
    const response = await handleMcp(
      new Request(`${BASE}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-session-id": "does-not-exist",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );
    expect(response.status).toBe(404);
  });

  test("reserves the session quota before a job is billed", async () => {
    const { client } = await startClient();
    const missing = await client.callTool({ name: "compress_image", arguments: {} });
    expect(missing.isError).toBe(true);
    expect(textOf(missing)).toContain("Invalid arguments");
    await client.close();
  });
});

describe("paid endpoints", () => {
  test("returns 402 with a PAYMENT-REQUIRED challenge", async () => {
    const { handlePaid } = await import("../src/main.ts");
    const request = new Request(`${BASE}/v1/agent/compress`, { method: "POST" });
    const response = await handlePaid(request, "compress");
    expect(response.status).toBe(402);
    const header = response.headers.get("payment-required");
    expect(header).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(header as string, "base64").toString("utf8"));
    expect(decoded.accepts[0].scheme).toBe("upto");
    expect(decoded.accepts[0].network).toBe("eip155:84532");
    expect(decoded.accepts[0].amount).toBe("5000");
    expect(decoded.accepts[0].asset).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    expect(decoded.accepts[0].payTo).toBeTruthy();
    expect(decoded.accepts[0].extra.assetTransferMethod).toBe("permit2");
    expect(decoded.extensions.bazaar).toBeTruthy();
  }, 60_000);
});
