import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { HttpException, type ArgumentsHost } from "@nestjs/common";
import { json, type Request, type Response, type NextFunction } from "express";
import { randomUUID, createHash } from "node:crypto";
import { AppModule } from "./app.js";

const configuredOrigins = process.env.CORS_ORIGINS ?? process.env.WEB_ORIGIN;
const origins = (configuredOrigins ?? "http://localhost:3000").split(",").map(s => s.trim()).filter(Boolean);
if (process.env.NODE_ENV === "production" && (!configuredOrigins || origins.includes("*"))) throw new Error("Production requires explicit CORS_ORIGINS or WEB_ORIGIN");
const app = await NestFactory.create(AppModule, { bodyParser: false });
app.enableShutdownHooks();
app.enableCors({ origin: origins, allowedHeaders: ["Authorization", "Content-Type", "Last-Event-ID"], exposedHeaders: ["X-Request-ID"] });
const buckets = new Map<string, { count: number; reset: number }>();
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = randomUUID();
  res.setHeader("X-Request-ID", requestId);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  const start = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - start })));
  if (req.path === "/health") return next();
  const worker = req.path.startsWith("/v1/workers/") && /\/(logs|stages|heartbeat|claim|status|complete|source)(\/|$)/.test(req.path);
  const key = createHash("sha256").update((req.socket.remoteAddress ?? "") + ":" + (req.headers.authorization ?? "")).digest("hex");
  if (buckets.size > 10000) for (const [id, value] of buckets) if (value.reset < Date.now()) buckets.delete(id);
  if (!buckets.has(key) && buckets.size >= 10000) return res.status(429).json({ message: "Rate limiter capacity reached", requestId });
  const bucket = buckets.get(key) ?? { count: 0, reset: Date.now() + 60000 };
  if (bucket.reset < Date.now()) { bucket.count = 0; bucket.reset = Date.now() + 60000; }
  buckets.set(key, bucket);
  if (++bucket.count > (worker ? 6000 : 300)) { res.setHeader("Retry-After", "60"); return res.status(429).json({ message: "Too many requests. Try again shortly.", requestId }); }
  next();
});
app.use(json({ limit: "1mb", verify: (request, _response, buffer) => { (request as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); } }));
app.useGlobalFilters({ catch(exception: unknown, host: ArgumentsHost) {
  const response = host.switchToHttp().getResponse<Response>();
  const status = exception instanceof HttpException ? exception.getStatus() : 500;
  const body = exception instanceof HttpException ? exception.getResponse() : null;
  const message = typeof body === "object" && body && "message" in body ? body.message : status === 500 ? "Internal server error" : String(body);
  if (!response.headersSent) response.status(status).json({ statusCode: status, message, requestId: response.getHeader("X-Request-ID") });
} });
await app.listen(Number(process.env.PORT ?? process.env.API_PORT ?? 4000), "0.0.0.0");
