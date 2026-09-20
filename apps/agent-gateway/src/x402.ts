import {
  HTTPFacilitatorClient,
  x402HTTPResourceServer,
  x402ResourceServer,
  type HTTPAdapter,
  type HTTPRequestContext,
  type HTTPResponseInstructions,
  type RouteConfig,
  type RoutesConfig,
} from "@x402/core/server";
import type { Network, PaymentPayload } from "@x402/core/types";
import { UptoEvmScheme } from "@x402/evm/upto/server";
import { declareDiscoveryExtension, declareEip2612GasSponsoringExtension } from "@x402/extensions";
import type { GatewayConfig } from "./config.ts";

export const COMPRESS_PATH = "/v1/agent/compress";
export const UPSCALE_PATH = "/v1/agent/upscale";

export type PaidKind = "compress" | "upscale";

export interface X402Setup {
  httpServer: x402HTTPResourceServer;
}

class WebAdapter implements HTTPAdapter {
  constructor(private readonly req: Request) {}

  getHeader(name: string): string | undefined {
    return this.req.headers.get(name) ?? undefined;
  }

  getMethod(): string {
    return this.req.method;
  }

  getPath(): string {
    return new URL(this.req.url).pathname;
  }

  getUrl(): string {
    return this.req.url;
  }

  getAcceptHeader(): string {
    return this.req.headers.get("accept") ?? "";
  }

  getUserAgent(): string {
    return this.req.headers.get("user-agent") ?? "";
  }

  getQueryParams(): Record<string, string | string[]> {
    const params: Record<string, string> = {};
    new URL(this.req.url).searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }

  getQueryParam(name: string): string | string[] | undefined {
    return new URL(this.req.url).searchParams.get(name) ?? undefined;
  }

  getBody(): unknown {
    return undefined;
  }
}

export function responseFromInstructions(instructions: HTTPResponseInstructions): Response {
  const headers = new Headers();
  for (const [key, value] of Object.entries(instructions.headers)) {
    headers.set(key, String(value));
  }
  if (instructions.isHtml) {
    return new Response(String(instructions.body ?? ""), { status: instructions.status, headers });
  }
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return new Response(JSON.stringify(instructions.body ?? {}), { status: instructions.status, headers });
}

export function requestContext(request: Request, path: string): HTTPRequestContext {
  const adapter = new WebAdapter(request);
  return {
    adapter,
    path,
    method: request.method,
    paymentHeader:
      adapter.getHeader("payment-signature") ?? adapter.getHeader("x-payment") ?? undefined,
  };
}

export function settlementAmount(config: GatewayConfig, kind: PaidKind, billable: boolean): string {
  if (!billable) return "0";
  return kind === "compress" ? config.x402CompressSettlePrice : config.x402UpscaleSettlePrice;
}

export function payerAddressOf(paymentPayload: PaymentPayload): string | undefined {
  const payload = paymentPayload.payload as Record<string, unknown> | undefined;
  const permit2 = payload?.permit2Authorization as Record<string, unknown> | undefined;
  const authorization = payload?.authorization as Record<string, unknown> | undefined;
  const candidate = permit2?.from ?? authorization?.from ?? payload?.from ?? payload?.payer;
  return typeof candidate === "string" ? candidate.toLowerCase() : undefined;
}

const READY_TIMEOUT_MS = 8_000;

export class X402Bootstrap {
  readonly httpServer: x402HTTPResourceServer;

  private constructor(httpServer: x402HTTPResourceServer) {
    this.httpServer = httpServer;
  }

  static create(config: GatewayConfig): X402Bootstrap {
    const facilitator = new HTTPFacilitatorClient({ url: config.x402FacilitatorUrl });
    const resourceServer = new x402ResourceServer(facilitator).register(
      config.x402Network as Network,
      new UptoEvmScheme(),
    );
    const httpServer = new x402HTTPResourceServer(resourceServer, buildRoutes(config));
    return new X402Bootstrap(httpServer);
  }

  async initialize(): Promise<void> {
    await this.httpServer.initialize();
  }
}

export async function initializeX402(config: GatewayConfig): Promise<X402Setup> {
  const bootstrap = X402Bootstrap.create(config);
  await Promise.race([
    bootstrap.initialize(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`x402 facilitator initialize timed out after ${READY_TIMEOUT_MS}ms`)), READY_TIMEOUT_MS),
    ),
  ]);
  return { httpServer: bootstrap.httpServer };
}

function buildRoutes(config: GatewayConfig): RoutesConfig {
  const compress: RouteConfig = {
    accepts: [
      {
        scheme: "upto",
        network: config.x402Network as Network,
        payTo: config.x402PayTo,
        price: config.x402CompressMaxPrice,
        maxTimeoutSeconds: 300,
      },
    ],
    resource: `${config.publicBaseUrl}${COMPRESS_PATH}`,
    description:
      "Compress a PNG/JPEG/GIF/WebP/AVIF image. The authorised amount is an upper bound; only a compression that produced a smaller file is charged, and failures are free.",
    mimeType: "application/json",
    serviceName: "LubanPNG",
    tags: ["image", "compression", "png", "jpeg", "webp", "avif"],
    extensions: {
      ...declareDiscoveryExtension({
        input: { file: "<image bytes>", convert: "webp", background: "#ffffff" },
        inputSchema: {
          properties: {
            file: { type: "string", description: "image file (PNG, JPEG, GIF, WebP or AVIF)" },
            convert: { type: "string", enum: ["png", "jpeg", "webp", "avif"] },
            background: { type: "string" },
          },
          required: ["file"],
        },
        bodyType: "form-data",
        output: {
          example: {
            task_id: "550e8400-e29b-41d4-a716-446655440000",
            status: "completed",
            original_bytes: 102400,
            compressed_bytes: 51200,
            savings_ratio: 0.5,
            download_url: `${config.publicBaseUrl}/v1/images/download/550e8400-e29b-41d4-a716-446655440000.png`,
            no_gain: false,
            charged: config.x402CompressSettlePrice,
          },
        },
      }),
      ...declareEip2612GasSponsoringExtension(),
    },
  };

  const upscale: RouteConfig = {
    accepts: [
      {
        scheme: "upto",
        network: config.x402Network as Network,
        payTo: config.x402PayTo,
        price: config.x402UpscaleMaxPrice,
        maxTimeoutSeconds: 300,
      },
    ],
    resource: `${config.publicBaseUrl}${UPSCALE_PATH}`,
    description:
      "Upscale a PNG/JPEG image by 2x or 4x. The authorised amount is an upper bound; only a successful upscale is charged and failures are free.",
    mimeType: "application/json",
    serviceName: "LubanPNG",
    tags: ["image", "upscale", "super-resolution", "png", "jpeg"],
    extensions: {
      ...declareDiscoveryExtension({
        input: { file: "<image bytes>", scale: "x4" },
        inputSchema: {
          properties: {
            file: { type: "string", description: "PNG or JPEG file, at most 2.25 MP / 20 MiB" },
            scale: { type: "string", enum: ["x2", "x4"] },
          },
          required: ["file", "scale"],
        },
        bodyType: "form-data",
        output: {
          example: {
            task_id: "550e8400-e29b-41d4-a716-446655440000",
            status: "completed",
            original_bytes: 102400,
            compressed_bytes: 819200,
            scale: "x4",
            download_url: `${config.publicBaseUrl}/v1/images/download/550e8400-e29b-41d4-a716-446655440000.png`,
            charged: config.x402UpscaleSettlePrice,
          },
        },
      }),
      ...declareEip2612GasSponsoringExtension(),
    },
  };

  return {
    [`POST ${COMPRESS_PATH}`]: compress,
    [`POST ${UPSCALE_PATH}`]: upscale,
  };
}
