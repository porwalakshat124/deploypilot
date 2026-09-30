import { LoadingCards, PageHeader } from "./ui";
export default function Loading() {
  return <><PageHeader eyebrow="Workspace" title="Loading dashboard" description="Getting the latest workspace data…" /><LoadingCards label="Loading dashboard" /></>;
}
