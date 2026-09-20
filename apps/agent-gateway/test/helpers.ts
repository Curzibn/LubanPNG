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
    x402Enabled: true,
    x402FacilitatorUrl: "https://x402.org/facilitator",
    x402Network: "eip155:84532",
    x402PayTo: "0x0000000000000000000000000000000000000001",
    x402CompressMaxPrice: "$0.005",
    x402CompressSettlePrice: "$0.003",
    x402UpscaleMaxPrice: "$0.02",
    x402UpscaleSettlePrice: "$0.015",
    x402ServiceApiKey: "",
    x402CompressDailyLimit: 5_000,
    x402UpscaleDailyLimit: 500,
    statusWaitMaxSeconds: 30,
    upstreamTimeoutMs: 120_000,
    trustClientIp: true,
    ...overrides,
  };
}
