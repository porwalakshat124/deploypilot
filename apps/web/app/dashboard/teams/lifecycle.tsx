"use client";
import { useState } from "react";
import { apiRequest } from "../../../lib/api";
import { Card } from "../ui";
import { Notice, useFeedback } from "../feedback";
type Team = { id: string; name: string; role: string; archivedAt?: string | null; ownerTransferToId?: string | null; currentUserId: string; members: { userId: string; role: string; user: { email: string } }[] };
export function TeamLifecycle({ team, refresh }: { team: Team; refresh: () => Promise<void> }) {
  const [name,setName] = useState(""), [target,setTarget] = useState(""), [busy,setBusy] = useState(false);
  const feedback = useFeedback();
  async function run(action: string, body = {}) {
    setBusy(true);feedback.clear();
    try { await apiRequest("/v1/teams/"+team.id+"/"+action,{method:"POST",body:JSON.stringify(body)});setName("");await refresh();feedback.success("Team updated."); }
    catch(e) {feedback.fail(e,"Unable to update team");}finally{setBusy(false);}
  }
  if (team.role !== "OWNER" && team.ownerTransferToId !== team.currentUserId) return null;
  return <Card><h2>Team ownership & archive</h2><Notice message={feedback.message} />
    {team.archivedAt ? <><p>This team is archived. Its history is retained and its workers are revoked. Restoring requires new worker credentials.</p><button className="dp-btn" disabled={busy} onClick={()=>void run("restore")}>Restore team</button></> : <>
    {team.role === "OWNER" && <><p>Ownership transfer requires acceptance by an existing administrator.</p><label className="dp-label">New owner<select className="dp-select" value={target} onChange={e=>setTarget(e.target.value)}><option value="">Choose administrator</option>{team.members.filter(m=>m.role==="ADMIN").map(m=><option value={m.userId} key={m.userId}>{m.user.email}</option>)}</select></label><button className="dp-btn" disabled={busy || !target} onClick={()=>void run("transfer",{userId:target})}>Request ownership transfer</button>{team.ownerTransferToId && <button className="dp-btn" disabled={busy} onClick={()=>void run("transfer",{userId:""})}>Cancel pending transfer</button>}<h3>Archive team</h3><p>Stop recorded runtimes and finish running builds first. Archiving cancels queued builds, revokes workers and invitations, and hides repositories. History is retained and the owner can restore the team.</p><label className="dp-label">Type {team.name} to confirm<input className="dp-input" value={name} onChange={e=>setName(e.target.value)} /></label><button className="dp-btn dp-btn-danger" disabled={busy || name!==team.name} onClick={()=>void run("archive",{name})}>Archive team</button></>}
    {team.ownerTransferToId === team.currentUserId && <><p>The current owner has requested that you take ownership.</p><button className="dp-btn dp-btn-primary" disabled={busy} onClick={()=>void run("transfer/accept")}>Accept ownership</button></>}
    </>}
  </Card>;
}
