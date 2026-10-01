import { expect, it } from "vitest";
import { authRedirect } from "./auth-redirect";
const origin="https://deploypilot-web.vercel.app";
it("preserves local navigation after GitHub authentication",()=>{
  expect(authRedirect("/dashboard/repositories?import=1",origin).href).toBe(origin+"/dashboard/repositories?import=1");
});
it("rejects external and deceptive callback destinations",()=>{
  for(const target of ["https://attacker.example","//attacker.example","/\\attacker.example","javascript:alert(1)","\n//attacker.example",null]) expect(authRedirect(target,origin).href).toBe(origin+"/dashboard");
});
