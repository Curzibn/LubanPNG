import { describe, expect, it } from "vitest"
import type { VisitPayload } from "../api/client.ts"
import {
  buildVisitPayload,
  referrerHost,
  shouldReportVisit,
  trackVisit,
  VISIT_WINDOW_MS,
  type VisitDependencies,
} from "./visits.ts"

describe("referrerHost", () => {
  it("reads the host of an external referrer", () => {
    expect(referrerHost("https://news.example.com/a/b?c=1")).toBe("news.example.com")
  })

  it("returns an empty string for empty or invalid referrers", () => {
    expect(referrerHost("")).toBe("")
    expect(referrerHost("not a url")).toBe("")
  })
})

describe("buildVisitPayload", () => {
  it("keeps the path, referrer host and utm parameters", () => {
    expect(
      buildVisitPayload(
        { pathname: "/pricing", search: "?utm_source=news&utm_medium=email&utm_campaign=launch" },
        "https://news.example.com/post",
      ),
    ).toEqual({
      path: "/pricing",
      referrer_host: "news.example.com",
      utm_source: "news",
      utm_medium: "email",
      utm_campaign: "launch",
    })
  })

  it("leaves missing utm parameters null", () => {
    const payload = buildVisitPayload({ pathname: "/", search: "" }, "")
    expect(payload.utm_source).toBeNull()
    expect(payload.utm_medium).toBeNull()
    expect(payload.utm_campaign).toBeNull()
    expect(payload.referrer_host).toBe("")
  })
})

describe("shouldReportVisit", () => {
  it("reports when nothing was recorded", () => {
    expect(shouldReportVisit(null, 1_000)).toBe(true)
  })

  it("suppresses reports inside the thirty minute window", () => {
    expect(shouldReportVisit(1_000, 1_000 + VISIT_WINDOW_MS - 1)).toBe(false)
    expect(shouldReportVisit(1_000, 1_000 + VISIT_WINDOW_MS)).toBe(true)
  })
})

describe("trackVisit", () => {
  const dependencies = (
    overrides: Partial<VisitDependencies> = {},
  ): { deps: VisitDependencies; sent: VisitPayload[]; last: () => number | null } => {
    const sent: VisitPayload[] = []
    let last: number | null = null
    const deps: VisitDependencies = {
      now: () => 1_000,
      readLast: () => last,
      writeLast: (timestamp) => {
        last = timestamp
      },
      referrer: () => "",
      send: async (payload) => {
        sent.push(payload)
      },
      ...overrides,
    }
    return { deps, sent, last: () => last }
  }

  it("sends once and records the timestamp", async () => {
    const { deps, sent, last } = dependencies({ referrer: () => "https://news.example.com/post" })
    await trackVisit({ pathname: "/pricing", search: "?utm_source=news" }, deps)
    expect(sent).toEqual([
      {
        path: "/pricing",
        referrer_host: "news.example.com",
        utm_source: "news",
        utm_medium: null,
        utm_campaign: null,
      },
    ])
    expect(last()).toBe(1_000)
  })

  it("stays silent inside the dedupe window", async () => {
    const { deps, sent } = dependencies({
      now: () => 1_000 + VISIT_WINDOW_MS - 1,
      readLast: () => 1_000,
    })
    await trackVisit({ pathname: "/", search: "" }, deps)
    expect(sent).toEqual([])
  })

  it("swallows reporting failures", async () => {
    const { deps } = dependencies({
      send: async () => {
        throw new Error("offline")
      },
    })
    await expect(trackVisit({ pathname: "/", search: "" }, deps)).resolves.toBeUndefined()
  })
})
