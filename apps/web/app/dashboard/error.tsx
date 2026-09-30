"use client";
import { Notice } from "./feedback";
import { PageHeader } from "./ui";
export default function DashboardError({ reset }: { reset: () => void }) {
  return <><PageHeader eyebrow="Workspace" title="This page could not load" description="Reload this page to continue working." /><Notice message="Something interrupted this page. Try loading it again." retry={reset} /></>;
}
