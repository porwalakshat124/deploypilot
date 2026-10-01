import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { githubLogin, logoutAccount } from "./github-login";
it("always asks GitHub to show the account picker",async()=>{
  const signInWithOAuth=vi.fn().mockResolvedValue({error:null});
  await githubLogin({auth:{signInWithOAuth}} as unknown as SupabaseClient,"https://deploypilot-web.vercel.app");
  expect(signInWithOAuth).toHaveBeenCalledWith({provider:"github",options:{redirectTo:"https://deploypilot-web.vercel.app/auth/callback",queryParams:{prompt:"select_account"}}});
});
it("clears only this browser's DeployPilot session and reports logout failure",async()=>{
  const signOut=vi.fn().mockResolvedValue({error:null});
  const client={auth:{signOut}} as unknown as SupabaseClient;
  await logoutAccount(client); expect(signOut).toHaveBeenCalledWith({scope:"local"});
  signOut.mockResolvedValue({error:{message:"Try again"}});
  await expect(logoutAccount(client)).rejects.toThrow("Try again");
});
