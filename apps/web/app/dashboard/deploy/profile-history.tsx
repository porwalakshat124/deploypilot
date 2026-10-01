"use client";
import { useState } from "react";
import { Card } from "../ui";
type Version = { id: string; branchRule: string; version: number; profile: object };
export function ProfileHistory({ versions }: { versions: Version[] }) {
  const [leftId, setLeftId] = useState(""), [rightId, setRightId] = useState("");
  const left = versions.find(v => v.id === leftId), right = versions.find(v => v.id === rightId);
  const previous = left?.profile as Record<string, unknown> | undefined, next = right?.profile as Record<string, unknown> | undefined;
  const fields = [...new Set([...Object.keys(previous ?? {}), ...Object.keys(next ?? {})])].sort();
  const changed = fields.filter(key => JSON.stringify(previous?.[key]) !== JSON.stringify(next?.[key]));
  return <Card style={{marginTop:18}}><h2>Compare build profiles</h2><div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{[{label:"Previous",id:leftId,setter:setLeftId},{label:"Next",id:rightId,setter:setRightId}].map(({label,id,setter})=><label className="dp-label" key={label}>{label} version<select className="dp-select" value={id} onChange={e=>setter(e.target.value)}><option value="">Choose a version</option>{versions.map(version=><option key={version.id} value={version.id}>{version.branchRule} · v{version.version} · {version.id.slice(0,6)}</option>)}</select></label>)}</div>{left && right && (changed.length ? <div style={{overflowX:"auto"}}><table style={{width:"100%",textAlign:"left",marginTop:16}}><thead><tr><th>Setting</th><th>Previous</th><th>Next</th></tr></thead><tbody>{changed.map(key=><tr key={key}><th>{key}</th><td><code>{JSON.stringify(previous?.[key]) ?? "Not set"}</code></td><td><code>{JSON.stringify(next?.[key]) ?? "Not set"}</code></td></tr>)}</tbody></table></div> : <p>These versions have identical build settings.</p>)}</Card>;
}
