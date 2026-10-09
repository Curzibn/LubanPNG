export interface GatewayConfig {
  port: number;
  upstreamUrl: string;
  publicBaseUrl: string;
  sessionQuotaLimit: number;
  sessionUpscaleLimit: number;
  globalAnonymousDailyLimit: number;
  sessionTtlMs: number;
  statusWaitMaxSeconds: number;
  upstreamTimeoutMs: number;
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

export function loadConfig(): GatewayConfig {
  return {
    port: readInt("AGENT_GATEWAY_PORT", 8080),
    upstreamUrl: readString("AGENT_GATEWAY_UPSTREAM_URL", "http://lubanpng:80"),
    publicBaseUrl: readString("AGENT_GATEWAY_PUBLIC_BASE_URL", "https://lubanpng.wizthink.cn"),
    sessionQuotaLimit: readInt("AGENT_GATEWAY_SESSION_QUOTA", 5),
    sessionUpscaleLimit: readInt("AGENT_GATEWAY_SESSION_UPSCALE_QUOTA", 1),
    globalAnonymousDailyLimit: readInt("AGENT_GATEWAY_ANONYMOUS_DAILY_LIMIT", 10_000),
    sessionTtlMs: readInt("AGENT_GATEWAY_SESSION_TTL_MS", 86_400_000),
    statusWaitMaxSeconds: readInt("AGENT_GATEWAY_STATUS_WAIT_MAX", 30),
    upstreamTimeoutMs: readInt("AGENT_GATEWAY_UPSTREAM_TIMEOUT_MS", 120_000),
  };
}
