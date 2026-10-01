import { createBrowserClient } from "@supabase/ssr";
export async function accessToken() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    if (typeof window !== "undefined") window.location.assign("/login");
    throw new Error("Your session has expired. Sign in to continue.");
  }
  return data.session.access_token;
}
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  const response = await fetch(process.env.NEXT_PUBLIC_API_URL + path, { ...init, signal: init?.signal ?? AbortSignal.timeout(60000), headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...init?.headers } });
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") window.location.assign("/login");
    const body = await response.json().catch(() => null) as { message?: string | string[]; requestId?: string } | null;
    const message = Array.isArray(body?.message) ? body.message.join("; ") : body?.message;
    throw new Error((message ?? "Request failed (HTTP " + response.status + ")") + (body?.requestId ? " · Request " + body.requestId : ""));
  }
  return response.json() as Promise<T>;
}

export async function githubProviderToken() {
  const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await client.auth.getSession();
  if (!data.session?.provider_token) throw new Error("Authorize organization access again to synchronize an organization installation.");
  return data.session.provider_token;
}
export async function authorizeOrganizations() {
  const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error } = await client.auth.signInWithOAuth({ provider: "github", options: { scopes: "read:org", redirectTo: window.location.origin + "/auth/callback" } });
  if (error) throw new Error(error.message);
}
