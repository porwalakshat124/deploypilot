"use client";
import { TeamLifecycle } from "./lifecycle";
import { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/api";
import { useApiResource } from "../../../lib/use-api-resource";
import { Notice, useFeedback } from "../feedback";
import { Badge, Card, Empty, LoadingCards, PageHeader, formatDate } from "../ui";
import { CopyButton, useRepository } from "../repository-context";

type Role = "OWNER" | "ADMIN" | "DEVELOPER" | "VIEWER";
type Team = { id: string; name: string; members: { role: Role }[]; _count: { members: number; repositories: number } };
type Detail = { archivedAt: string | null; ownerTransferToId: string | null; id: string; name: string; role: Role; currentUserId: string; members: { userId: string; role: Role; user: { displayName: string; email: string } }[]; repositories: { id: string; fullName: string }[]; invites?: { id: string; email: string; role: Role; expiresAt: string }[]; audit?: { id: string; action: string; subject: string; createdAt: string }[] };
export default function TeamsPage() {
  const teams = useApiResource<{ teams: Team[] }>("/v1/teams");
  const [teamId, setTeamId] = useState(""), [name, setName] = useState(""), [email, setEmail] = useState(""), [role, setRole] = useState<Role>("DEVELOPER");
  const [inviteToken, setInviteToken] = useState(""), [inviteLink, setInviteLink] = useState(""), [busy, setBusy] = useState(false), [repositoryId, setRepositoryId] = useState("");
  const detail = useApiResource<Detail>(teamId ? "/v1/teams/" + teamId : null);
  const { repositories, refresh } = useRepository(); const feedback = useFeedback();
  useEffect(() => { const token = window.location.hash.slice(1); if (token) { setInviteToken(token); window.history.replaceState(null, "", window.location.pathname); } }, []);
  useEffect(() => { if (teams.data && !teamId) setTeamId(teams.data.teams[0]?.id ?? ""); }, [teams.data, teamId]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true); feedback.clear();
    try { await work(); teams.reload(); detail.reload(); await refresh(); }
    catch (error) { feedback.fail(error, "Unable to update team"); }
    finally { setBusy(false); }
  };
  const data = detail.data, admin = !data?.archivedAt && (data?.role === "OWNER" || data?.role === "ADMIN");
  const editable = (member: Detail["members"][number]) => !data?.archivedAt && member.role !== "OWNER" && member.userId !== data?.currentUserId && (data?.role === "OWNER" || (data?.role === "ADMIN" && member.role !== "ADMIN"));
  return <>
    <PageHeader eyebrow="Access & ownership" title="Teams" description="Invite teammates, assign roles and connect repositories. Each team runs its builds on its own Docker workers." />
    <Notice message={feedback.message || teams.error || detail.error} retry={teams.error ? teams.reload : detail.error ? detail.reload : undefined} />
    <div style={{ display: "grid", gap: 20 }}>
      <Card><h2>Create a team</h2><form onSubmit={e => { e.preventDefault(); void run(async () => { const created = await apiRequest<Team>("/v1/teams", { method: "POST", body: JSON.stringify({ name }) }); setTeamId(created.id); setName(""); feedback.success("Team created."); }); }}><label className="dp-label">Team name<input className="dp-input" required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label><button className="dp-btn dp-btn-primary" disabled={busy}>Create team</button></form></Card>
      <Card><h2>Accept an invitation</h2><p className="dp-muted">Sign in with the email address your team invited. Invitation links expire after seven days.</p><form onSubmit={e => { e.preventDefault(); void run(async () => { const result = await apiRequest<{ teamId: string }>("/v1/team-invites/accept", { method: "POST", body: JSON.stringify({ token: inviteToken.trim().split("#").at(-1) }) }); setTeamId(result.teamId); setInviteToken(""); feedback.success("Invitation accepted."); }); }}><label className="dp-label">Invitation link or token<input type="password" autoComplete="off" className="dp-input" required value={inviteToken} onChange={e => setInviteToken(e.target.value)} /></label><button className="dp-btn" disabled={busy}>Join team</button></form></Card>
      {teams.loading ? <LoadingCards label="Loading teams" /> : !teams.error && !teams.data?.teams.length ? <Empty title="No teams yet" text="Create your first team or accept an invitation above." /> : <label className="dp-label">Team<select className="dp-select" value={teamId} onChange={e => { setTeamId(e.target.value); setInviteLink(""); }}><option value="">Choose a team</option>{teams.data?.teams.map(team => <option key={team.id} value={team.id}>{team.name} · {team.members[0]?.role} · {team._count.members} members</option>)}</select></label>}
      {detail.loading && <LoadingCards label="Loading team" />}
      {data && <>
        <Card><h2>{data.name} <Badge status={data.role} /></h2><p>Viewers can inspect runs and logs. Developers can configure builds and deploy. Administrators manage environments, workers and developer/viewer membership. Owners also manage administrators.</p><h3>Members</h3>{data.members.map(member => <div key={member.userId} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid var(--line)" }}><div style={{ flex: 1 }}>{member.user.displayName || member.user.email}<div className="dp-muted">{member.user.email}</div></div><Badge status={member.role} />{editable(member) && <><select aria-label={"Role for " + member.user.email} className="dp-select" style={{ width: 150 }} disabled={busy} value={member.role} onChange={e => void run(async () => { await apiRequest("/v1/teams/" + teamId + "/members/" + member.userId, { method: "PATCH", body: JSON.stringify({ role: e.target.value }) }); feedback.success("Role updated."); })}>{(data.role === "OWNER" ? ["ADMIN", "DEVELOPER", "VIEWER"] : ["DEVELOPER", "VIEWER"]).map(value => <option key={value}>{value}</option>)}</select><button className="dp-btn" disabled={busy} onClick={() => void run(async () => { await apiRequest("/v1/teams/" + teamId + "/members/" + member.userId, { method: "DELETE" }); feedback.success("Member removed."); })}>Remove</button></>}</div>)}</Card>
        {admin && <Card><h2>Invite a teammate</h2><form onSubmit={e => { e.preventDefault(); void run(async () => { const result = await apiRequest<{ token: string }>("/v1/teams/" + teamId + "/invites", { method: "POST", body: JSON.stringify({ email, role }) }); setInviteLink(window.location.origin + "/dashboard/teams#" + result.token); setEmail(""); feedback.success("Invitation created. Share the link with your teammate."); }); }}><label className="dp-label">Email<input type="email" className="dp-input" required value={email} onChange={e => setEmail(e.target.value)} /></label><label className="dp-label">Role<select className="dp-select" value={role} onChange={e => setRole(e.target.value as Role)}><option>VIEWER</option><option>DEVELOPER</option>{data.role === "OWNER" && <option>ADMIN</option>}</select></label><button className="dp-btn" disabled={busy}>Create invitation</button></form>{inviteLink && <div style={{ marginTop: 15 }}><label className="dp-label">Invitation link (shown only now)<input className="dp-input" readOnly value={inviteLink} /></label><CopyButton value={inviteLink} label="Copy invitation" /></div>}{data.invites?.map(invite => <p key={invite.id}>{invite.email} · {invite.role} · expires {formatDate(invite.expiresAt)} <button className="dp-btn" disabled={busy || (data.role !== "OWNER" && invite.role === "ADMIN")} onClick={() => void run(async () => { await apiRequest("/v1/teams/" + teamId + "/invites/" + invite.id, { method: "DELETE" }); feedback.success("Invitation revoked."); })}>Revoke</button></p>)}</Card>}
        <Card><h2>Repositories</h2>{data.repositories.length ? data.repositories.map(repo => <p key={repo.id}>{repo.fullName}</p>) : <p>No repositories connected.</p>}{admin && <form onSubmit={e => { e.preventDefault(); void run(async () => { await apiRequest("/v1/teams/" + teamId + "/repositories/" + repositoryId, { method: "POST" }); setRepositoryId(""); feedback.success("Repository connected to team."); }); }}><p>Connecting a personal repository gives team members access to its deployments and logs. Workers stay restricted to that repository. Team assignment cannot be undone here.</p><label className="dp-label">Personal repository<select required className="dp-select" value={repositoryId} onChange={e => setRepositoryId(e.target.value)}><option value="">Choose a repository</option>{repositories.filter(repo => !repo.teamId).map(repo => <option key={repo.id} value={repo.id}>{repo.fullName}</option>)}</select></label><button className="dp-btn" disabled={busy || !repositoryId}>Connect repository</button></form>}</Card>
        <TeamLifecycle key={teamId} team={data} refresh={async()=>{teams.reload();detail.reload();await refresh();}} />
        {admin && <Card><h2>Recent access changes</h2>{data.audit?.map(event => <p key={event.id}><strong>{event.action}</strong> · {event.subject} · {formatDate(event.createdAt)}</p>)}</Card>}
      </>}
    </div>
  </>;
}
