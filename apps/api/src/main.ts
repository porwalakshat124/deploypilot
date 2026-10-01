import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { HttpException, type ArgumentsHost } from "@nestjs/common";
import { json, raw, type Request, type Response, type NextFunction } from "express";
import { validOperationsCredential } from "./operations-alerts.js";
import { randomUUID } from "node:crypto";
import { consumeRateLimit } from "./rate-limit.js";
import { AppModule } from "./app.js";

const configuredOrigins = process.env.CORS_ORIGINS ?? process.env.WEB_ORIGIN;
const origins = (configuredOrigins ?? "http://localhost:3000").split(",").map(s => s.trim()).filter(Boolean);
if (process.env.NODE_ENV === "production" && (!configuredOrigins || origins.includes("*"))) throw new Error("Production requires explicit CORS_ORIGINS or WEB_ORIGIN");
const app = await NestFactory.create(AppModule, { bodyParser: false });
app.enableShutdownHooks();
app.enableCors({ origin: origins, allowedHeaders: ["Authorization", "Content-Type", "Last-Event-ID", "X-GitHub-Token"], exposedHeaders: ["X-Request-ID"] });
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = randomUUID();
  res.setHeader("X-Request-ID", requestId);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  const start = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - start })));
  if (["/health", "/ready", "/health/ready"].includes(req.path)) return next();
  const worker = req.path.startsWith("/v1/workers/") && /\/(logs|stages|heartbeat|claim|status|complete|source|runtimes|runtime-commands|report)(\/|$)/.test(req.path);
  const identity = req.headers.authorization ?? req.socket.remoteAddress ?? "unknown-peer";
  void consumeRateLimit(worker ? "worker" : "request", identity, worker ? 6000 : 300).then(allowed => {
    if (allowed) return next();
    res.setHeader("Retry-After", "60");
    res.status(429).json({ message: "Too many requests. Try again shortly.", requestId });
  }).catch(() => { res.status(503).json({ message: "Request protection temporarily unavailable", requestId }); });
});
app.use("/v1/operations/backups", (req: Request, res: Response, next: NextFunction) => {
  if (!validOperationsCredential(req.headers.authorization)) return res.status(401).json({ message: "Unauthorized" });
  raw({ type: "application/octet-stream", limit: "20mb" })(req, res, next);
});
app.use(json({ limit: "1mb", verify: (request, _response, buffer) => { (request as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); } }));
app.useGlobalFilters({ catch(exception: unknown, host: ArgumentsHost) {
  const response = host.switchToHttp().getResponse<Response>();
  const status = exception instanceof HttpException ? exception.getStatus() : 500;
  if (status === 500) {
    const code = exception && typeof exception === "object" && "code" in exception ? String(exception.code) : undefined;
    console.error(JSON.stringify({ requestId: response.getHeader("X-Request-ID"), error: exception instanceof Error ? exception.name : "UnknownError", code }));
  }
  const body = exception instanceof HttpException ? exception.getResponse() : null;
  const message = typeof body === "object" && body && "message" in body ? body.message : status === 500 ? "Internal server error" : String(body);
  if (!response.headersSent) response.status(status).json({ statusCode: status, message, requestId: response.getHeader("X-Request-ID") });
} });
await app.listen(Number(process.env.PORT ?? process.env.API_PORT ?? 4000), "0.0.0.0");
