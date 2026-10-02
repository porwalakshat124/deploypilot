import dotenv from "dotenv";
dotenv.config({ path: new URL("../../../.env", import.meta.url) });
process.env.DATABASE_CONNECTION_LIMIT ??= "5";
const { db } = await import("@deploypilot/database/client");
const days = Number(process.env.LOG_RETENTION_DAYS ?? 30);
if (!Number.isInteger(days) || days < 7 || days > 3650) throw new Error("Retention must be 7–3650 days");
try {
  const cutoff = new Date(Date.now() - days * 86400000);
  const candidates = await db.deployment.findMany({ where: {
    status: { in: ["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"] }, endedAt: { lt: cutoff },
    effects: { some: { kind: "archive", status: "SUCCEEDED" } },
    logs: { some: {} },
  }, select: { id: true, status: true, endedAt: true, _count: { select: { logs: true } } }, take: 100 });
  const cloudLogs = await db.deployment.findMany({where:{status:{in:["SUCCEEDED","FAILED","CANCELLED","TIMED_OUT"]},endedAt:{lt:new Date(Date.now()-90*86400000)},logs:{none:{}},events:{some:{type:"logs.retained"}},effects:{some:{kind:"archive",status:{in:["SUCCEEDED","EXPIRING"]}}},OR:[{runtime:null},{runtime:{state:"STOPPED"}}]},select:{id:true,endedAt:true},take:100});
  console.log(JSON.stringify({ mode: "preview-only", days, candidates, cloudArchiveDays:90, cloudLogsRequiringChecksumProof:cloudLogs, preserved: ["deployment history", "audit events", "backup objects", "Docker images", "running containers", "secrets"], deletionEnabled: false }));
} finally { await db.$disconnect(); }
