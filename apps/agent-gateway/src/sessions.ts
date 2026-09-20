import type { GatewayConfig } from "./config.ts";

export type TaskKind = "compress" | "upscale";

export interface SessionState {
  sessionId: string;
  cookie?: string;
  apiKey?: string;
  pending: Record<TaskKind, number>;
  consumed: Record<TaskKind, number>;
  createdAt: number;
  lastSeenAt: number;
}

export type ReserveDenial =
  | { allowed: false; kind: TaskKind; reason: "session_quota"; limit: number }
  | { allowed: false; kind: TaskKind; reason: "anonymous_daily_breaker"; limit: number };

export type ReserveVerdict = { allowed: true } | ReserveDenial;

function shanghaiDayKey(now: number): string {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

class DailyCounter {
  private day: string;
  private count = 0;

  constructor(private readonly now: () => number) {
    this.day = shanghaiDayKey(now());
  }

  private roll(): void {
    const today = shanghaiDayKey(this.now());
    if (today !== this.day) {
      this.day = today;
      this.count = 0;
    }
  }

  hit(): number {
    this.roll();
    this.count += 1;
    return this.count;
  }

  value(): number {
    this.roll();
    return this.count;
  }
}

export class SessionRegistry {
  private readonly sessions = new Map<string, SessionState>();
  private readonly anonymousDaily: DailyCounter;
  private readonly x402Daily: Record<TaskKind, DailyCounter>;
  private readonly payers = new Map<string, PayerSubject>();

  constructor(
    private readonly config: GatewayConfig,
    private readonly now: () => number = Date.now,
  ) {
    this.anonymousDaily = new DailyCounter(now);
    this.x402Daily = { compress: new DailyCounter(now), upscale: new DailyCounter(now) };
  }

  session(sessionId: string): SessionState {
    this.evictExpired();
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.lastSeenAt = this.now();
      return existing;
    }
    const created: SessionState = {
      sessionId,
      pending: { compress: 0, upscale: 0 },
      consumed: { compress: 0, upscale: 0 },
      createdAt: this.now(),
      lastSeenAt: this.now(),
    };
    this.sessions.set(sessionId, created);
    return created;
  }

  bindCookie(sessionId: string, cookie: string): void {
    this.session(sessionId).cookie = cookie;
  }

  bindApiKey(sessionId: string, apiKey: string): void {
    this.session(sessionId).apiKey = apiKey;
  }

  private limitFor(kind: TaskKind): number {
    return kind === "compress" ? this.config.sessionQuotaLimit : this.config.sessionUpscaleLimit;
  }

  reserve(sessionId: string, kind: TaskKind): ReserveVerdict {
    const state = this.session(sessionId);
    const limit = this.limitFor(kind);
    if (state.consumed[kind] + state.pending[kind] >= limit) {
      return { allowed: false, kind, reason: "session_quota", limit };
    }
    if (!state.apiKey && this.anonymousDaily.value() >= this.config.globalAnonymousDailyLimit) {
      return {
        allowed: false,
        kind,
        reason: "anonymous_daily_breaker",
        limit: this.config.globalAnonymousDailyLimit,
      };
    }
    state.pending[kind] += 1;
    if (!state.apiKey) this.anonymousDaily.hit();
    return { allowed: true };
  }

  release(sessionId: string, kind: TaskKind, billable: boolean): void {
    const state = this.session(sessionId);
    state.pending[kind] = Math.max(0, state.pending[kind] - 1);
    if (billable) state.consumed[kind] += 1;
  }

  anonymousDailyUsed(): number {
    return this.anonymousDaily.value();
  }

  activeSessionCount(): number {
    this.evictExpired();
    return this.sessions.size;
  }

  payer(address: string): PayerSubject {
    const key = address.toLowerCase();
    const existing = this.payers.get(key);
    if (existing) return existing;
    const created: PayerSubject = {};
    this.payers.set(key, created);
    return created;
  }

  bindPayerCookie(address: string, cookie: string): void {
    this.payer(address).cookie = cookie;
  }

  noteX402Call(kind: TaskKind): number {
    return this.x402Daily[kind].hit();
  }

  x402DailyUsed(kind: TaskKind): number {
    return this.x402Daily[kind].value();
  }

  payerCount(): number {
    return this.payers.size;
  }

  private evictExpired(): void {
    const cutoff = this.now() - this.config.sessionTtlMs;
    for (const [id, state] of this.sessions) {
      if (state.lastSeenAt < cutoff) this.sessions.delete(id);
    }
  }
}

export interface PayerSubject {
  cookie?: string;
}

export function newSessionId(): string {
  return crypto.randomUUID();
}
