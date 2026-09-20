import { describe, expect, test } from "bun:test";
import { SessionRegistry, newSessionId } from "../src/sessions.ts";
import { loadConfig } from "../src/config.ts";
import { testConfig } from "./helpers.ts";

describe("SessionRegistry", () => {
  test("anonymous session allows five compress calls then refuses", () => {
    const registry = new SessionRegistry(testConfig());
    const id = newSessionId();
    for (let i = 0; i < 5; i += 1) {
      expect(registry.reserve(id, "compress").allowed).toBe(true);
      registry.release(id, "compress", true);
    }
    const verdict = registry.reserve(id, "compress");
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.reason).toBe("session_quota");
      expect(verdict.limit).toBe(5);
    }
  });

  test("upscale is capped at one per session", () => {
    const registry = new SessionRegistry(testConfig());
    const id = newSessionId();
    expect(registry.reserve(id, "upscale").allowed).toBe(true);
    registry.release(id, "upscale", true);
    const verdict = registry.reserve(id, "upscale");
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe("session_quota");
  });

  test("a free job does not consume the session allowance", () => {
    const registry = new SessionRegistry(testConfig());
    const id = newSessionId();
    registry.reserve(id, "compress");
    registry.release(id, "compress", false);
    expect(registry.session(id).consumed.compress).toBe(0);
    expect(registry.session(id).pending.compress).toBe(0);
  });

  test("sessions are isolated from each other", () => {
    const registry = new SessionRegistry(testConfig());
    const first = newSessionId();
    const second = newSessionId();
    for (let i = 0; i < 5; i += 1) {
      registry.reserve(first, "compress");
      registry.release(first, "compress", true);
    }
    expect(registry.reserve(first, "compress").allowed).toBe(false);
    expect(registry.reserve(second, "compress").allowed).toBe(true);
  });

  test("anonymous daily breaker trips for anonymous sessions only", () => {
    const registry = new SessionRegistry(testConfig({ globalAnonymousDailyLimit: 2 }));
    expect(registry.reserve(newSessionId(), "compress").allowed).toBe(true);
    expect(registry.reserve(newSessionId(), "compress").allowed).toBe(true);
    const tripped = registry.reserve(newSessionId(), "compress");
    expect(tripped.allowed).toBe(false);
    if (!tripped.allowed) expect(tripped.reason).toBe("anonymous_daily_breaker");

    const withKey = newSessionId();
    registry.bindApiKey(withKey, "lp_live_example");
    expect(registry.reserve(withKey, "compress").allowed).toBe(true);
  });

  test("expired sessions are evicted", () => {
    let now = 1_000;
    const registry = new SessionRegistry(testConfig({ sessionTtlMs: 100 }), () => now);
    const id = newSessionId();
    registry.session(id);
    expect(registry.activeSessionCount()).toBe(1);
    now += 500;
    expect(registry.activeSessionCount()).toBe(0);
  });

  test("payer cookie is cached per payer address", () => {
    const registry = new SessionRegistry(testConfig());
    registry.bindPayerCookie("0xABC", "lp_device=one");
    expect(registry.payer("0xabc").cookie).toBe("lp_device=one");
    registry.bindPayerCookie("0xabc", "lp_device=two");
    expect(registry.payer("0xABC").cookie).toBe("lp_device=two");
    expect(registry.payerCount()).toBe(1);
  });

  test("x402 daily counters are independent per kind", () => {
    const registry = new SessionRegistry(testConfig());
    registry.noteX402Call("compress");
    registry.noteX402Call("compress");
    registry.noteX402Call("upscale");
    expect(registry.x402DailyUsed("compress")).toBe(2);
    expect(registry.x402DailyUsed("upscale")).toBe(1);
  });
});

describe("loadConfig", () => {
  test("defaults match the documented anonymous pool", () => {
    const config = loadConfig();
    expect(config.sessionQuotaLimit).toBe(5);
    expect(config.sessionUpscaleLimit).toBe(1);
    expect(config.globalAnonymousDailyLimit).toBe(10_000);
    expect(config.x402Network).toBe("eip155:84532");
    expect(config.x402FacilitatorUrl).toBe("https://x402.org/facilitator");
  });
});
