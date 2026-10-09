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

  test("reserves the session quota before a job is counted", async () => {
    const { client } = await startClient();
    const missing = await client.callTool({ name: "compress_image", arguments: {} });
    expect(missing.isError).toBe(true);
    expect(textOf(missing)).toContain("Invalid arguments");
    await client.close();
  });
});

const TINY_BASE64 = "aGVsbG8=";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function mockUpstream(handler: (url: string) => Response): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) =>
    handler(String(input))) as unknown as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function completedCompressTask(): Record<string, unknown> {
  return {
    task_id: "t1",
    status: "completed",
    kind: "compress",
    original_name: "a.png",
    original_size: 300,
    compressed_size: 200,
    quota_units: 1,
    no_gain: false,
    downloadable: true,
    created_at: 1,
  };
}

function mePayload(): Record<string, unknown> {
  return {
    subject: "device",
    email: null,
    plan: {
      id: "anonymous",
      name: "anonymous",
      period: "day",
      quota: 5,
      max_file_size: 5242880,
      retention_hours: 24,
      max_api_keys: 0,
    },
    quota: {
      period_key: "2026-10-09",
      limit: 5,
      used: 1,
      held: 0,
      remaining: 4,
      resets_at: "2026-10-09T16:00:00Z",
    },
  };
}

describe("limits and error reporting", () => {
  test("a full MCP session is reported as a session limit, not an upstream reset", async () => {
    const restore = mockUpstream((url) => {
      if (url.includes("/v1/me")) {
        return jsonResponse({ code: 0, msg: "success", data: mePayload() }, 200, {
          "set-cookie": "lp_device=dev-1; Path=/; HttpOnly",
        });
      }
      return url.includes("/v1/images/compress/")
        ? jsonResponse({ code: 0, msg: "success", data: completedCompressTask() })
        : jsonResponse({ code: 0, msg: "success", data: { task_id: "t1" } });
    });
    try {
      const { client } = await startClient();
      for (let i = 0; i < 5; i += 1) {
        const ok = await client.callTool({
          name: "compress_image",
          arguments: { image_base64: TINY_BASE64, filename: `t${i}.png` },
        });
        expect(ok.isError ?? false).toBe(false);
      }
      const denied = await client.callTool({
        name: "compress_image",
        arguments: { image_base64: TINY_BASE64, filename: "over.png" },
      });
      const text = textOf(denied);
      expect(text).toContain("call allowance (5 per session)");
      expect(text).toContain("does not renew with the upstream quota");
      expect(text).toContain("separate from this session limit");
      expect(text).not.toContain("lp_api_key");
      expect(text).not.toContain("new session");
      await client.close();
    } finally {
      restore();
    }
  });

  test("an upstream 429 keeps its own message and retry hint", async () => {
    const restore = mockUpstream((url) => {
      if (url.includes("/v1/me")) {
        return jsonResponse({ code: 0, msg: "success", data: mePayload() }, 200, {
          "set-cookie": "lp_device=dev-1; Path=/; HttpOnly",
        });
      }
      return jsonResponse(
        { code: 4004, msg: "upscale queue is full; try again later", data: { queue_depth: 10 } },
        429,
        { "retry-after": "30" },
      );
    });
    try {
      const { client } = await startClient();
      const denied = await client.callTool({
        name: "upscale_image",
        arguments: { image_base64: TINY_BASE64, scale: "x2", filename: "queue.png" },
      });
      expect(denied.isError).toBe(true);
      const text = textOf(denied);
      expect(text).toContain("upscale queue is full");
      expect(text).toContain("retry after 30s");
      expect(text).not.toContain("Quota exhausted for this subject");
      await client.close();
    } finally {
      restore();
    }
  });

  test("check_quota separates the upstream quota from the session allowance", async () => {
    const restore = mockUpstream((url) => {
      if (url.includes("/v1/me")) {
        return jsonResponse({ code: 0, msg: "success", data: mePayload() }, 200, {
          "set-cookie": "lp_device=dev-1; Path=/; HttpOnly",
        });
      }
      return jsonResponse({ code: 0, msg: "success", data: {} });
    });
    try {
      const { client } = await startClient();
      const result = await client.callTool({ name: "check_quota", arguments: {} });
      const text = textOf(result);
      expect(text).toContain("Upstream subject");
      expect(text).toContain("This MCP session has used 0/5 compress and 0/1 upscale calls");
      expect(text).toContain("separate from the upstream quota");
      await client.close();
    } finally {
      restore();
    }
  });

  test("concurrent first calls in one session share a single upstream subject", async () => {
    let meCalls = 0;
    const submitCookies: Array<string | null> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const cookie = new Headers(init?.headers).get("cookie");
      if (url.includes("/v1/me")) {
        meCalls += 1;
        return jsonResponse({ code: 0, msg: "success", data: mePayload() }, 200, {
          "set-cookie": "lp_device=dev-1; Path=/; HttpOnly",
        });
      }
      if (url.includes("/v1/images/compress/")) {
        return jsonResponse({ code: 0, msg: "success", data: completedCompressTask() });
      }
      submitCookies.push(cookie);
      return jsonResponse({ code: 0, msg: "success", data: { task_id: "t1" } });
    }) as unknown as typeof fetch;
    try {
      const { client } = await startClient();
      const [first, second] = await Promise.all([
        client.callTool({ name: "compress_image", arguments: { image_base64: TINY_BASE64, filename: "c1.png" } }),
        client.callTool({ name: "compress_image", arguments: { image_base64: TINY_BASE64, filename: "c2.png" } }),
      ]);
      expect(first.isError ?? false).toBe(false);
      expect(second.isError ?? false).toBe(false);
      expect(meCalls).toBe(1);
      expect(submitCookies).toEqual(["lp_device=dev-1", "lp_device=dev-1"]);
      await client.close();
    } finally {
      globalThis.fetch = original;
    }
  });

  test("separate sessions never share an upstream subject", async () => {
    let meCalls = 0;
    const submitCookies: Array<string | null> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const cookie = new Headers(init?.headers).get("cookie");
      if (url.includes("/v1/me")) {
        meCalls += 1;
        return jsonResponse({ code: 0, msg: "success", data: mePayload() }, 200, {
          "set-cookie": `lp_device=dev-${meCalls}; Path=/; HttpOnly`,
        });
      }
      if (url.includes("/v1/images/compress/")) {
        return jsonResponse({ code: 0, msg: "success", data: completedCompressTask() });
      }
      submitCookies.push(cookie);
      return jsonResponse({ code: 0, msg: "success", data: { task_id: "t1" } });
    }) as unknown as typeof fetch;
    try {
      const [one, two] = await Promise.all([startClient(), startClient()]);
      const [first, second] = await Promise.all([
        one.client.callTool({ name: "compress_image", arguments: { image_base64: TINY_BASE64, filename: "s1.png" } }),
        two.client.callTool({ name: "compress_image", arguments: { image_base64: TINY_BASE64, filename: "s2.png" } }),
      ]);
      expect(first.isError ?? false).toBe(false);
      expect(second.isError ?? false).toBe(false);
      expect(meCalls).toBe(2);
      expect(submitCookies).toHaveLength(2);
      expect([...submitCookies].sort()).toEqual(["lp_device=dev-1", "lp_device=dev-2"]);
      await one.client.close();
      await two.client.close();
    } finally {
      globalThis.fetch = original;
    }
  });

  test("a failed subject preparation aborts without submitting and can recover", async () => {
    let meCalls = 0;
    let meHealthy = false;
    const submitted: Array<string | null> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const cookie = new Headers(init?.headers).get("cookie");
      if (url.includes("/v1/me")) {
        meCalls += 1;
        if (!meHealthy) return jsonResponse({ code: 2001, msg: "subject backend down" }, 500);
        return jsonResponse({ code: 0, msg: "success", data: mePayload() }, 200, {
          "set-cookie": "lp_device=dev-1; Path=/; HttpOnly",
        });
      }
      if (url.includes("/v1/images/compress/")) {
        return jsonResponse({ code: 0, msg: "success", data: completedCompressTask() });
      }
      submitted.push(cookie);
      return jsonResponse({ code: 0, msg: "success", data: { task_id: "t1" } });
    }) as unknown as typeof fetch;
    try {
      const { client } = await startClient();
      const failed = await Promise.all([
        client.callTool({ name: "compress_image", arguments: { image_base64: TINY_BASE64, filename: "f1.png" } }),
        client.callTool({ name: "compress_image", arguments: { image_base64: TINY_BASE64, filename: "f2.png" } }),
      ]);
      expect(failed[0].isError).toBe(true);
      expect(failed[1].isError).toBe(true);
      expect(textOf(failed[0])).toContain("Could not prepare the upstream subject");
      expect(textOf(failed[0])).toContain("not sent");
      expect(submitted).toHaveLength(0);

      meHealthy = true;
      const recovered = await Promise.all([
        client.callTool({ name: "compress_image", arguments: { image_base64: TINY_BASE64, filename: "r1.png" } }),
        client.callTool({ name: "compress_image", arguments: { image_base64: TINY_BASE64, filename: "r2.png" } }),
      ]);
      expect(recovered[0].isError ?? false).toBe(false);
      expect(recovered[1].isError ?? false).toBe(false);
      expect(meCalls).toBe(2);
      expect(submitted).toEqual(["lp_device=dev-1", "lp_device=dev-1"]);

      for (let i = 0; i < 3; i += 1) {
        const extra = await client.callTool({ name: "compress_image", arguments: { image_base64: TINY_BASE64, filename: `r${i + 3}.png` } });
        expect(extra.isError ?? false).toBe(false);
      }
      const denied = await client.callTool({ name: "compress_image", arguments: { image_base64: TINY_BASE64, filename: "over.png" } });
      expect(denied.isError).toBe(true);
      expect(textOf(denied)).toContain("call allowance");
      await client.close();
    } finally {
      globalThis.fetch = original;
    }
  });

  test("a preparation without a device credential aborts and can retry", async () => {
    let meCalls = 0;
    const submitted: Array<string | null> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const cookie = new Headers(init?.headers).get("cookie");
      if (url.includes("/v1/me")) {
        meCalls += 1;
        const headers: Record<string, string> = {};
        if (meCalls > 1) headers["set-cookie"] = "lp_device=dev-1; Path=/; HttpOnly";
        return jsonResponse({ code: 0, msg: "success", data: mePayload() }, 200, headers);
      }
      if (url.includes("/v1/images/compress/")) {
        return jsonResponse({ code: 0, msg: "success", data: completedCompressTask() });
      }
      submitted.push(cookie);
      return jsonResponse({ code: 0, msg: "success", data: { task_id: "t1" } });
    }) as unknown as typeof fetch;
    try {
      const { client } = await startClient();
      const first = await client.callTool({ name: "compress_image", arguments: { image_base64: TINY_BASE64, filename: "n1.png" } });
      expect(first.isError).toBe(true);
      expect(textOf(first)).toContain("Could not prepare the upstream subject");
      expect(textOf(first)).toContain("did not issue a device credential");
      expect(submitted).toHaveLength(0);

      const second = await client.callTool({ name: "compress_image", arguments: { image_base64: TINY_BASE64, filename: "n2.png" } });
      expect(second.isError ?? false).toBe(false);
      expect(meCalls).toBe(2);
      expect(submitted).toEqual(["lp_device=dev-1"]);
      await client.close();
    } finally {
      globalThis.fetch = original;
    }
  });
});
