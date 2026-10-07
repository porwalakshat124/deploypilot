import type { Metadata } from "next";

export const SITE_URL = "https://deploypilot-web.vercel.app";
export function publicMetadata(title: string, description: string, path: string): Metadata {
  const url = `${SITE_URL}${path}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, siteName: "DeployPilot", type: "website" }, twitter: { card: "summary", title, description } };
}
export function jsonLd(value: unknown) { return JSON.stringify(value).replace(/</g, "\\u003c"); }
