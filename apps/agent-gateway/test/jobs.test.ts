import { describe, expect, test } from "bun:test";
import { jobPayload } from "../src/jobs.ts";
import { settlementAmount } from "../src/x402.ts";
import type { TaskView } from "../src/lubanpng-client.ts";
import { testConfig } from "./helpers.ts";

const config = testConfig();

function task(overrides: Partial<TaskView>): TaskView {
  return {
    task_id: "t",
    status: "completed",
    progress: 100,
    source: "web",
    kind: "compress",
    original_name: "a.png",
    original_size: 1000,
    compressed_size: 400,
    quota_units: 1,
    no_gain: false,
    created_at: 1,
    downloadable: true,
    ...overrides,
  };
}

describe("settlementAmount", () => {
  test("bills the agreed price only for billable work", () => {
    expect(settlementAmount(config, "compress", true)).toBe("$0.003");
    expect(settlementAmount(config, "compress", false)).toBe("0");
    expect(settlementAmount(config, "upscale", true)).toBe("$0.015");
    expect(settlementAmount(config, "upscale", false)).toBe("0");
  });
});

describe("jobPayload", () => {
  test("reports savings ratio and the download link for a billable result", () => {
    const payload = jobPayload({
      task: task({}),
      downloadUrl: "https://lubanpng.wizthink.cn/v1/images/download/t.png",
      billable: true,
      completed: true,
    });
    expect(payload.savings_ratio).toBe(0.6);
    expect(payload.no_gain).toBe(false);
    expect(payload.download_url).toBe("https://lubanpng.wizthink.cn/v1/images/download/t.png");
  });

  test("reports no gain without a download charge", () => {
    const payload = jobPayload({
      task: task({ compressed_size: 1000, no_gain: true, quota_units: 0 }),
      downloadUrl: null,
      billable: false,
      completed: true,
    });
    expect(payload.no_gain).toBe(true);
    expect(payload.quota_units).toBe(0);
    expect(payload.savings_ratio).toBe(0);
  });

  test("keeps savings null when there is no output size", () => {
    const payload = jobPayload({
      task: task({ status: "failed", compressed_size: null, no_gain: true, quota_units: 0, downloadable: false }),
      downloadUrl: null,
      billable: false,
      completed: false,
    });
    expect(payload.savings_ratio).toBeNull();
    expect(payload.download_url).toBeNull();
  });
});

describe("settlement amount for the paid channel", () => {
  test("charges the settled price for billable work and zero otherwise", () => {
    expect(settlementAmount(config, "compress", true)).toBe("$0.003");
    expect(settlementAmount(config, "compress", false)).toBe("0");
    expect(settlementAmount(config, "upscale", true)).toBe("$0.015");
    expect(settlementAmount(config, "upscale", false)).toBe("0");
  });
});

describe("runCompress billing", () => {
  test("waits for a running task, then reports no_gain as non billable", async () => {
    const { runCompress } = await import("../src/jobs.ts");
    const responses = [
      { code: 0, msg: "success", data: { task_id: "t1" } },
      { code: 0, msg: "success", data: task({ status: "processing", downloadable: false, compressed_size: null }) },
      { code: 0, msg: "success", data: task({ status: "completed", compressed_size: 1000, no_gain: true, quota_units: 0, downloadable: false }) },
    ];
    let index = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      const payload = responses[Math.min(index++, responses.length - 1)]!;
      return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    try {
      const client = new (await import("../src/lubanpng-client.ts")).LubanPngClient(config);
      const outcome = await runCompress(client, config, { data: new Uint8Array([1]), filename: "a.png" }, { session: {} });
      expect(outcome.task.status).toBe("completed");
      expect(outcome.billable).toBe(false);
      expect(outcome.downloadUrl).toBeNull();
    } finally {
      globalThis.fetch = original;
    }
  });
});
