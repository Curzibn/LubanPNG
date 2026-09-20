import { once } from "node:events"
import { createServer, type IncomingMessage } from "node:http"

export type RecordedRequest = {
  method: string
  url: string
  headers: IncomingMessage["headers"]
  body: string
}

export type MockServer = {
  baseUrl: string
  requests: RecordedRequest[]
  close: () => Promise<void>
}

export const QUOTA_HEADERS = {
  "X-Quota-Limit": "50",
  "X-Quota-Remaining": "46",
  "X-Quota-Reset": "2026-10-01T00:00:00+08:00",
}

const meBody = {
  code: 0,
  msg: "success",
  data: {
    subject: "account",
    email: "zibin@example.com",
    plan: {
      id: "free",
      name: "免费",
      period: "month",
      quota: 50,
      max_file_size: 5242880,
      retention_hours: 24,
      max_api_keys: 1,
    },
    quota: {
      period_key: "2026-09",
      limit: 50,
      used: 7,
      held: 0,
      remaining: 46,
      resets_at: "2026-10-01T00:00:00+08:00",
    },
  },
}

const convertField = (body: string): string | null => {
  const match = /name="convert"\r\n\r\n([^\r]+)\r\n/.exec(body)
  return match?.[1] ?? null
}

const extensionFor = (format: string | null): string => (format === "jpeg" ? "jpg" : format ?? "png")

const ORIGINAL_SIZE = 4

export const startMockServer = async (compressedBytes: Uint8Array): Promise<MockServer> => {
  const requests: RecordedRequest[] = []
  let lastConvert: string | null = null
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk as Uint8Array))
    requests.push({
      method: req.method ?? "GET",
      url: req.url ?? "/",
      headers: req.headers,
      body: Buffer.concat(chunks).toString("latin1"),
    })

    const url = new URL(req.url ?? "/", "http://localhost")
    const english = String(req.headers["accept-language"] ?? "").toLowerCase().startsWith("en")
    const message = (zh: string, en: string): string => (english ? en : zh)
    const sendJson = (status: number, payload: unknown): void => {
      res.writeHead(status, { "Content-Type": "application/json", ...QUOTA_HEADERS })
      res.end(JSON.stringify(payload))
    }

    const authorization = req.headers.authorization
    if (url.pathname === "/v1/me") {
      if (authorization === "Bearer lp_quota") {
        sendJson(429, {
          code: 4003,
          msg: message("本期额度已用完", "Quota used up for this period"),
          data: { remaining: 0 },
        })
        return
      }
      if (authorization === "Bearer lp_missing") {
        sendJson(404, { code: 3003, msg: message("任务不存在", "Task not found"), data: null })
        return
      }
      if (authorization !== "Bearer lp_test_key" && authorization !== "Bearer lp_fail") {
        sendJson(401, {
          code: 4001,
          msg: message("API Key 无效或已吊销", "API key is invalid or revoked"),
          data: null,
        })
        return
      }
      sendJson(200, meBody)
      return
    }

    if (url.pathname === "/v1/images/compress" && req.method === "POST") {
      lastConvert = convertField(requests.at(-1)?.body ?? "")
      sendJson(200, { code: 0, msg: "success", data: { task_id: "task-1" } })
      return
    }

    if (url.pathname.startsWith("/v1/images/compress/")) {
      if (authorization === "Bearer lp_fail") {
        sendJson(200, {
          code: 0,
          msg: "success",
          data: {
            task_id: "task-1",
            status: "failed",
            progress: 100,
            source: "cli",
            original_name: "photo.png",
            original_size: ORIGINAL_SIZE,
            compressed_size: null,
            compressed_url: null,
            target_format: null,
            output_format: null,
            quota_units: 0,
            no_gain: true,
            error_msg: message("压缩失败：解码错误", "compression failed: decoder error"),
            created_at: 1_760_000_000,
            completed_at: 1_760_000_001,
            expires_at: null,
            queue_position: null,
            downloadable: false,
          },
        })
        return
      }
      sendJson(200, {
        code: 0,
        msg: "success",
        data: {
          task_id: "task-1",
          status: "completed",
          progress: 100,
          source: "cli",
          original_name: "photo.png",
          original_size: ORIGINAL_SIZE,
          compressed_size: compressedBytes.byteLength,
          compressed_url: `/v1/images/download/compressed_photo.${extensionFor(lastConvert)}`,
          target_format: lastConvert,
          output_format: lastConvert ?? "png",
          quota_units: compressedBytes.byteLength >= ORIGINAL_SIZE ? 0 : lastConvert === null ? 1 : 2,
          no_gain: compressedBytes.byteLength >= ORIGINAL_SIZE,
          error_msg: null,
          created_at: 1_760_000_000,
          completed_at: 1_760_000_001,
          expires_at: 1_760_086_400,
          queue_position: null,
          downloadable: true,
        },
      })
      return
    }

    if (url.pathname.startsWith("/v1/images/download/")) {
      res.writeHead(200, { "Content-Type": "image/png", ...QUOTA_HEADERS })
      res.end(Buffer.from(compressedBytes))
      return
    }

    sendJson(404, { code: 3003, msg: message("接口不存在", "Endpoint not found"), data: null })
  })

  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  const port = typeof address === "object" && address !== null ? address.port : 0

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      }),
  }
}
