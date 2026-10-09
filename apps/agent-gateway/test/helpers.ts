import type { GatewayConfig } from "../src/config.ts";

export function testConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    port: 8080,
    upstreamUrl: "http://upstream.test",
    publicBaseUrl: "https://lubanpng.wizthink.cn",
    sessionQuotaLimit: 5,
    sessionUpscaleLimit: 1,
    globalAnonymousDailyLimit: 10_000,
    sessionTtlMs: 86_400_000,
    statusWaitMaxSeconds: 30,
    upstreamTimeoutMs: 120_000,
    ...overrides,
  };
}
