import { Injectable } from "@nestjs/common";

@Injectable()
export class NotificationsService {
  async deploymentResult(deploymentId: string, status: string) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) return { sent: false, reason: "Resend is not configured" };

    const deployment = await import("@deploypilot/database/client").then(({ db }) => db.deployment.findUnique({
      where: { id: deploymentId },
      include: { repository: { include: { owner: true, team: { include: { members: { where: { role: "OWNER" }, include: { user: true }, take: 1 } } } } }, environment: true },
    }));
    if (!deployment) return { sent: false, reason: "Deployment unavailable" };
    const recipient = deployment.repository.teamId ? deployment.repository.team?.members[0]?.user : deployment.repository.owner;
    if (!recipient?.email) return { sent: false, reason: "No current owner email" };
    if (recipient.emailNotifications === "OFF" || (recipient.emailNotifications === "FAILURES" && status === "SUCCEEDED")) return { sent: false, reason: "Disabled by recipient preferences" };

    const succeeded = status === "SUCCEEDED";
    const subject = `${succeeded ? "Deployment succeeded" : "Deployment needs attention"} · ${deployment.repository.fullName}`;
    const text = [
      `DeployPilot deployment ${succeeded ? "succeeded" : "finished with status: " + status}.`,
      "",
      `Repository: ${deployment.repository.fullName}`,
      `Commit: ${deployment.commitSha.slice(0, 12)}`,
      `Environment: ${deployment.environment?.name ?? "—"}`,
      `Deployment ID: ${deployment.id}`,
    ].join("\n");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `deployment/${deploymentId}/${status}` },
      body: JSON.stringify({ from, to: [recipient.email], subject, text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Resend request failed with HTTP ${response.status}`);
    return { sent: true };
  }
}
