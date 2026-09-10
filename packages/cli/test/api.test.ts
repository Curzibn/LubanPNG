import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { ApiClient, describeError, USER_AGENT } from "../src/api.js"
import { startMockServer, type MockServer } from "./mockServer.js"

describe("ApiClient", () => {
  let server: MockServer

  beforeAll(async () => {
    server = await startMockServer(new Uint8Array([137, 80, 78, 71]))
  })

  afterAll(async () => {
    await server.close()
  })

  it("sends the CLI User-Agent prefix and the bearer key", async () => {
    const client = new ApiClient({ baseUrl: server.baseUrl, apiKey: "lp_test_key" })
    const result = await client.me()
    expect(result.data.email).toBe("zibin@example.com")
    expect(result.data.plan.period).toBe("month")
    expect(result.quota).toEqual({
      limit: 50,
      remaining: 46,
      resetsAt: "2026-10-01T00:00:00+08:00",
    })
    const last = server.requests.at(-1)
    expect(last?.headers["user-agent"]).toBe(USER_AGENT)
    expect(String(last?.headers["user-agent"]).startsWith("lubanpng-cli")).toBe(true)
    expect(last?.headers.authorization).toBe("Bearer lp_test_key")
  })

  it("maps unauthorized responses to code 4001", async () => {
    const client = new ApiClient({ baseUrl: server.baseUrl, apiKey: "lp_bad" })
    await expect(client.me()).rejects.toMatchObject({ code: 4001 })
    try {
      await client.me()
    } catch (error) {
      expect(describeError(error)).toContain("API Key 无效")
    }
  })

  it("maps quota and not-found responses", async () => {
    const quotaClient = new ApiClient({ baseUrl: server.baseUrl, apiKey: "lp_quota" })
    await expect(quotaClient.me()).rejects.toMatchObject({ code: 4003 })
    const missingClient = new ApiClient({ baseUrl: server.baseUrl, apiKey: "lp_missing" })
    await expect(missingClient.me()).rejects.toMatchObject({ code: 3003 })
  })

  it("uploads a file as multipart with the file field and filename", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lubanpng-cli-"))
    try {
      const path = join(dir, "photo.png")
      await writeFile(path, new Uint8Array([1, 2, 3, 4]))
      const client = new ApiClient({ baseUrl: server.baseUrl, apiKey: "lp_test_key" })
      const result = await client.uploadImage(path)
      expect(result.data.task_id).toBe("task-1")
      const request = server.requests.at(-1)
      expect(request?.method).toBe("POST")
      expect(request?.body).toContain('name="file"')
      expect(request?.body).toContain('filename="photo.png"')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("polls a task with wait and downloads the product bytes", async () => {
    const client = new ApiClient({ baseUrl: server.baseUrl, apiKey: "lp_test_key" })
    const status = await client.taskStatus("task-1", 30)
    expect(status.data.status).toBe("completed")
    expect(server.requests.at(-1)?.url).toBe("/v1/images/compress/task-1?wait=30")
    const bytes = await client.download(status.data.compressed_url as string)
    expect(Array.from(bytes)).toEqual([137, 80, 78, 71])
  })
})
