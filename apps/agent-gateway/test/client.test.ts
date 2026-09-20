import { describe, expect, test } from "bun:test";
import { LubanPngClient, UpstreamError, extensionFor } from "../src/lubanpng-client.ts";
import { testConfig } from "./helpers.ts";

const config = testConfig();

function stubFetch(handler: (url: string, init: RequestInit) => Response): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init ?? {});
  }) as unknown as typeof fetch;
}

describe("LubanPngClient", () => {
  test("sends the anonymous request marker and captures the device cookie", async () => {
    const seen: { headers: Headers; url: string }[] = [];
    globalThis.fetch = stubFetch((url, init) => {
      seen.push({ headers: new Headers(init.headers), url });
      return new Response(JSON.stringify({ code: 0, msg: "success", data: { task_id: "t1" } }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "lp_device=abc.def; Path=/; HttpOnly",
          "x-quota-limit": "5",
          "x-quota-remaining": "4",
          "x-quota-reset": "2026-09-21T00:00:00+08:00",
        },
      });
    });

    const client = new LubanPngClient(config);
    let cookie: string | undefined;
    const result = await client.compress(
      { data: new Uint8Array([1, 2, 3]), filename: "a.png" },
      { session: {}, clientIp: "203.0.113.7" },
      (value) => {
        cookie = value;
      },
    );

    expect(result.data.task_id).toBe("t1");
    expect(cookie).toBe("lp_device=abc.def");
    expect(seen[0]!.headers.get("x-requested-with")).toBe("LubanPNG");
    expect(seen[0]!.headers.get("x-client-ip")).toBe("203.0.113.7");
    expect(seen[0]!.headers.get("cookie")).toBeNull();
    expect(result.quota).toEqual({ limit: 5, remaining: 4, reset: "2026-09-21T00:00:00+08:00" });
  });

  test("an api key replaces the anonymous marker and is forwarded as bearer", async () => {
    const seen: Headers[] = [];
    globalThis.fetch = stubFetch((_url, init) => {
      seen.push(new Headers(init.headers));
      return new Response(JSON.stringify({ code: 0, msg: "success", data: { task_id: "t2" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const client = new LubanPngClient(config);
    await client.compress(
      { data: new Uint8Array([1]), filename: "a.png" },
      { session: { apiKey: "lp_live_x", cookie: "lp_device=abc" } },
    );
    expect(seen[0]!.get("authorization")).toBe("Bearer lp_live_x");
    expect(seen[0]!.get("x-requested-with")).toBeNull();
    expect(seen[0]!.get("cookie")).toBe("lp_device=abc");
  });

  test("maps an error envelope to UpstreamError with quota headers", async () => {
    globalThis.fetch = stubFetch(
      () =>
        new Response(
          JSON.stringify({ code: 4003, msg: "额度已用尽", data: { resets_at: "2026-09-21T00:00:00+08:00" } }),
          {
            status: 429,
            headers: {
              "content-type": "application/json",
              "retry-after": "120",
              "x-quota-limit": "5",
              "x-quota-remaining": "0",
            },
          },
        ),
    );
    const client = new LubanPngClient(config);
    let captured: unknown;
    try {
      await client.compress({ data: new Uint8Array([1]), filename: "a.png" }, { session: {} });
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(UpstreamError);
    const err = captured as UpstreamError;
    expect(err.status).toBe(429);
    expect(err.code).toBe(4003);
    expect(err.message).toBe("额度已用尽");
    expect(err.retryAfter).toBe(120);
    expect(err.quota.remaining).toBe(0);
  });

  test("clamps the status wait to the configured maximum", async () => {
    let seenUrl = "";
    globalThis.fetch = stubFetch((url) => {
      seenUrl = url;
      return new Response(JSON.stringify({ code: 0, msg: "success", data: { task_id: "t", status: "pending" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const client = new LubanPngClient(config);
    await client.taskStatus("abc", 300, { session: {} });
    expect(seenUrl).toBe("http://upstream.test/v1/images/compress/abc?wait=30");
  });
});

describe("extensionFor", () => {
  test("prefers the reported output format and falls back to the name", () => {
    expect(
      extensionFor({
        task_id: "1",
        status: "completed",
        progress: 100,
        source: "web",
        kind: "compress",
        original_name: "photo.JPG",
        original_size: 10,
        quota_units: 1,
        no_gain: false,
        created_at: 0,
        downloadable: true,
        output_format: "webp",
      }),
    ).toBe("webp");
    expect(
      extensionFor({
        task_id: "1",
        status: "completed",
        progress: 100,
        source: "web",
        kind: "upscale",
        original_name: "photo.JPG",
        original_size: 10,
        quota_units: 1,
        no_gain: false,
        created_at: 0,
        downloadable: true,
      }),
    ).toBe("jpg");
  });
});
