export interface GatewayConfig {
  port: number;
  upstreamUrl: string;
  publicBaseUrl: string;
  sessionQuotaLimit: number;
  sessionUpscaleLimit: number;
  globalAnonymousDailyLimit: number;
  sessionTtlMs: number;
  x402Enabled: boolean;
  x402FacilitatorUrl: string;
  x402Network: string;
  x402PayTo: string;
  x402CompressMaxPrice: string;
  x402CompressSettlePrice: string;
  x402UpscaleMaxPrice: string;
  x402UpscaleSettlePrice: string;
  x402ServiceApiKey: string;
  x402CompressDailyLimit: number;
  x402UpscaleDailyLimit: number;
  statusWaitMaxSeconds: number;
  upstreamTimeoutMs: number;
  paidJobWaitMs: number;
  trustClientIp: boolean;
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return parsed;
}

function readString(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === "" ? fallback : raw.trim();
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  return raw.trim().toLowerCase() === "true";
}

export function loadConfig(): GatewayConfig {
  return {
    port: readInt("AGENT_GATEWAY_PORT", 8080),
    upstreamUrl: readString("AGENT_GATEWAY_UPSTREAM_URL", "http://lubanpng:80"),
    publicBaseUrl: readString("AGENT_GATEWAY_PUBLIC_BASE_URL", "https://lubanpng.wizthink.cn"),
    sessionQuotaLimit: readInt("AGENT_GATEWAY_SESSION_QUOTA", 5),
    sessionUpscaleLimit: readInt("AGENT_GATEWAY_SESSION_UPSCALE_QUOTA", 1),
    globalAnonymousDailyLimit: readInt("AGENT_GATEWAY_ANONYMOUS_DAILY_LIMIT", 10_000),
    sessionTtlMs: readInt("AGENT_GATEWAY_SESSION_TTL_MS", 86_400_000),
    x402Enabled: readBool("AGENT_GATEWAY_X402_ENABLED", true),
    x402FacilitatorUrl: readString("AGENT_GATEWAY_X402_FACILITATOR", "https://x402.org/facilitator"),
    x402Network: readString("AGENT_GATEWAY_X402_NETWORK", "eip155:84532"),
    x402PayTo: readString("AGENT_GATEWAY_X402_PAY_TO", ""),
    x402CompressMaxPrice: readString("AGENT_GATEWAY_X402_COMPRESS_MAX_PRICE", "$0.005"),
    x402CompressSettlePrice: readString("AGENT_GATEWAY_X402_COMPRESS_SETTLE_PRICE", "$0.003"),
    x402UpscaleMaxPrice: readString("AGENT_GATEWAY_X402_UPSCALE_MAX_PRICE", "$0.02"),
    x402UpscaleSettlePrice: readString("AGENT_GATEWAY_X402_UPSCALE_SETTLE_PRICE", "$0.015"),
    x402ServiceApiKey: readString("AGENT_GATEWAY_X402_SERVICE_API_KEY", ""),
    x402CompressDailyLimit: readInt("AGENT_GATEWAY_X402_COMPRESS_DAILY_LIMIT", 5_000),
    x402UpscaleDailyLimit: readInt("AGENT_GATEWAY_X402_UPSCALE_DAILY_LIMIT", 500),
    statusWaitMaxSeconds: readInt("AGENT_GATEWAY_STATUS_WAIT_MAX", 30),
    upstreamTimeoutMs: readInt("AGENT_GATEWAY_UPSTREAM_TIMEOUT_MS", 120_000),
    paidJobWaitMs: readInt("AGENT_GATEWAY_PAID_JOB_WAIT_MS", 50_000),
    trustClientIp: readBool("AGENT_GATEWAY_TRUST_CLIENT_IP", true),
  };
}
