"use client";
import { useState } from "react";
import Link from "next/link";
import { DeploymentPicker } from "../repository-context";
import { Card, PageHeader } from "../ui";
export default function LogsPage() {
  const [id, setId] = useState("");
  return <><PageHeader eyebrow="Observability / Output" title="Logs" description="Select a repository and run to search, filter, stream, or download its complete logs." /><Card><div style={{ display: "grid", gap: 16 }}><DeploymentPicker value={id} onChange={setId} />{id && <Link className="dp-btn dp-btn-primary" href={"/dashboard/deployments/" + id}>Open live logs</Link>}</div></Card></>;
}
