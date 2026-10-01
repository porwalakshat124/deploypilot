import type { SupabaseClient } from "@supabase/supabase-js";
export async function githubLogin(client: SupabaseClient, origin: string) {
  const { error } = await client.auth.signInWithOAuth({ provider: "github", options: {
    redirectTo: origin + "/auth/callback", queryParams: { prompt: "select_account" },
  } });
  if (error) throw new Error(error.message);
}
export async function logoutAccount(client: SupabaseClient) {
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw new Error(error.message);
}
