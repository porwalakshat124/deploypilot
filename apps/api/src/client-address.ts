import { isIP } from "node:net";

/** Render's Cloudflare edge overwrites this header; never trust X-Forwarded-For. */
export function clientAddress(cfConnectingIp: string | undefined, socketAddress: string | undefined, trustCloudflare: boolean) {
  if (trustCloudflare && cfConnectingIp && isIP(cfConnectingIp)) return cfConnectingIp;
  return socketAddress || "unknown-peer";
}
