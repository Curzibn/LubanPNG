import { tokens } from "@lubanpng/design-tokens/tokens"
import type { MessageKey } from "../i18n/messages.ts"

export const endpointRows: ReadonlyArray<{ method: string; path: string; purposeKey: MessageKey; authKey: MessageKey }> = [
  { method: "POST", path: "/v1/images/compress", purposeKey: "dev.endpoints.p1", authKey: "dev.auth.keySessionAnon" },
  { method: "POST", path: "/v1/images/upscale", purposeKey: "dev.endpoints.upscale", authKey: "dev.auth.keySessionAnon" },
  { method: "GET", path: "/v1/images/compress/{task_id}", purposeKey: "dev.endpoints.p2", authKey: "dev.auth.same" },
  { method: "GET", path: "/v1/images/download/{filename}", purposeKey: "dev.endpoints.p3", authKey: "dev.auth.same" },
  { method: "GET", path: "/v1/me", purposeKey: "dev.endpoints.p4", authKey: "dev.auth.same" },
  { method: "POST", path: "/v1/auth/otp", purposeKey: "dev.endpoints.p5", authKey: "dev.auth.none" },
  { method: "POST", path: "/v1/auth/verify", purposeKey: "dev.endpoints.p6", authKey: "dev.auth.none" },
  { method: "GET", path: "/v1/me/api-keys", purposeKey: "dev.endpoints.p7", authKey: "dev.auth.session" },
]

export const errorRows: ReadonlyArray<{ http: string; code: string; meaningKey: MessageKey }> = [
  { http: "400", code: "1001", meaningKey: "dev.error.e1" },
  { http: "413", code: "1004", meaningKey: "dev.error.e2" },
  { http: "401", code: "4001", meaningKey: "dev.error.e3" },
  { http: "429", code: "4003", meaningKey: "dev.error.e4" },
  { http: "404", code: "3003", meaningKey: "dev.error.e5" },
  { http: "500", code: "2002", meaningKey: "dev.error.e6" },
]

export const formatRows: ReadonlyArray<{
  format: string
  inputKey: MessageKey
  outputKey: MessageKey
  noteKey: MessageKey
}> = [
  { format: "PNG / APNG", inputKey: "dev.formats.supported", outputKey: "dev.formats.supported", noteKey: "dev.format.png.note" },
  { format: "JPEG", inputKey: "dev.formats.supported", outputKey: "dev.formats.supported", noteKey: "dev.format.jpeg.note" },
  { format: "GIF", inputKey: "dev.formats.supported", outputKey: "dev.formats.notTarget", noteKey: "dev.format.gif.note" },
  { format: "WebP", inputKey: "dev.formats.supported", outputKey: "dev.formats.supported", noteKey: "dev.format.webp.note" },
  { format: "AVIF", inputKey: "dev.formats.supported", outputKey: "dev.formats.supported", noteKey: "dev.format.avif.note" },
  {
    format: "HEIC / HEIF",
    inputKey: "dev.formats.apiUnsupported",
    outputKey: "dev.formats.unsupported",
    noteKey: "dev.format.heic.note",
  },
]

export const cliRows: ReadonlyArray<{ command: string; meaningKey: MessageKey }> = [
  { command: "login / logout", meaningKey: "dev.cli.login" },
  { command: "compress", meaningKey: "dev.cli.compress" },
  { command: "usage", meaningKey: "dev.cli.usage" },
]

export const upscaleLimitRows: ReadonlyArray<{ itemKey: MessageKey; valueKey: MessageKey }> = [
  { itemKey: "dev.upscale.limits.input", valueKey: "dev.upscale.limits.inputValue" },
  { itemKey: "dev.upscale.limits.scale", valueKey: "dev.upscale.limits.scaleValue" },
  { itemKey: "dev.upscale.limits.size", valueKey: "dev.upscale.limits.sizeValue" },
  { itemKey: "dev.upscale.limits.dimensions", valueKey: "dev.upscale.limits.dimensionsValue" },
  { itemKey: "dev.upscale.limits.output", valueKey: "dev.upscale.limits.outputValue" },
]

export const agentChannelRows: ReadonlyArray<{ channelKey: MessageKey; statusKey: MessageKey; noteKey: MessageKey }> = [
  { channelKey: "dev.agents.rest", statusKey: "dev.agents.restStatus", noteKey: "dev.agents.restNote" },
  { channelKey: "dev.agents.mcp", statusKey: "dev.agents.mcpStatus", noteKey: "dev.agents.mcpNote" },
  { channelKey: "dev.agents.x402", statusKey: "dev.agents.x402Status", noteKey: "dev.agents.x402Note" },
]

export const developerFaqs = [
  { questionKey: "dev.faq.q1", answerKey: "dev.faq.a1" },
  { questionKey: "dev.faq.q2", answerKey: "dev.faq.a2" },
  { questionKey: "dev.faq.q3", answerKey: "dev.faq.a3" },
  { questionKey: "dev.faq.q4", answerKey: "dev.faq.a4" },
  { questionKey: "dev.faq.q5", answerKey: "dev.faq.a5" },
] as const satisfies ReadonlyArray<{ questionKey: MessageKey; answerKey: MessageKey }>

export const uploadSample = (origin: string) =>
  [
    `curl -X POST ${origin}/v1/images/compress \\`,
    '  -H "Authorization: Bearer lp_live_…" \\',
    '  -F "file=@photo.png"',
    "",
    '{ "code": 0, "msg": "success", "data": { "task_id": "550e8400-…" } }',
  ].join("\n")

export const statusSample = (origin: string) =>
  [
    `curl "${origin}/v1/images/compress/550e8400-…?wait=30" \\`,
    '  -H "Authorization: Bearer lp_live_…"',
    "",
    '{ "code": 0, "data": { "status": "completed",',
    '    "original_size": 2516582, "compressed_size": 933241,',
    '    "output_format": "jpeg", "quota_units": 1,',
    '    "compressed_url": "/v1/images/download/550e8400-….jpg" } }',
  ].join("\n")

export const convertSample = (origin: string) =>
  [
    `curl -X POST ${origin}/v1/images/compress \\`,
    '  -H "Authorization: Bearer lp_live_…" \\',
    '  -F "file=@cutout.png" \\',
    '  -F "convert=jpeg" \\',
    `  -F "background=${tokens.color.surface.toLowerCase()}"`,
    "",
    '{ "code": 0, "data": { "status": "completed", "target_format": "jpeg",',
    '    "output_format": "jpeg", "quota_units": 2,',
    '    "compressed_url": "/v1/images/download/550e8400-….jpg" } }',
  ].join("\n")

export const upscaleSample = (origin: string) =>
  [
    `curl -X POST ${origin}/v1/images/upscale \\`,
    '  -H "Authorization: Bearer lp_live_…" \\',
    '  -F "file=@logo.png" \\',
    '  -F "scale=x2"',
    "",
    '{ "code": 0, "msg": "success", "data": { "task_id": "550e8400-…" } }',
  ].join("\n")

export const upscaleStatusSample = (origin: string) =>
  [
    `curl "${origin}/v1/images/compress/550e8400-…?wait=30" \\`,
    '  -H "Authorization: Bearer lp_live_…"',
    "",
    '{ "code": 0, "data": { "status": "completed", "kind": "upscale",',
    '    "scale": "x2", "original_size": 398829, "compressed_size": 1194351,',
    '    "output_format": "png", "quota_units": 1, "no_gain": false,',
    '    "compressed_url": "/v1/images/download/550e8400-….png" } }',
  ].join("\n")

export const downloadSample = (origin: string) => `curl -o photo.min.jpg "${origin}/v1/images/download/550e8400-….jpg"`

export const quotaHeadersSample = ["X-Quota-Limit: 50", "X-Quota-Remaining: 46", "X-Quota-Reset: 2026-10-01T00:00:00Z"].join("\n")
