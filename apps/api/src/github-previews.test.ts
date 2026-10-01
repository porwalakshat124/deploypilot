import { describe,it,expect,vi } from "vitest";
import { githubPreview } from "./github-previews.js";
const payload={action:"opened",number:12,installation:{id:1},repository:{id:2},pull_request:{head:{sha:"a".repeat(40),ref:"feature",repo:{id:2}}}};
function fixture(requiredSecretNames:string[]=[]) {
  const tx={repository:{findFirst:vi.fn().mockResolvedValue({id:"repo",previewEnabled:true,configs:[{id:"config",branchRule:"*",profile:{requiredSecretNames}}],workers:[{id:"worker",lastSeenAt:new Date(),capabilities:{runtimeManagement:true}}]})},deployment:{findFirst:vi.fn().mockResolvedValue(null),findMany:vi.fn().mockResolvedValue([]),create:vi.fn().mockResolvedValue({id:"deployment"})},environment:{upsert:vi.fn().mockResolvedValue({id:"preview-env"})}};
  return tx;
}
describe("PR previews",()=>{
  it("never deploys fork code",async()=>{const tx=fixture();expect(await githubPreview(tx as never,{...payload,pull_request:{head:{...payload.pull_request.head,repo:{id:999}}}})).toBe("ignored-fork-preview");expect(tx.deployment.create).not.toHaveBeenCalled();});
  it("never inherits production secrets",async()=>{const tx=fixture(["DATABASE_URL"]);expect(await githubPreview(tx as never,payload)).toBe("ignored-preview-profile");expect(tx.deployment.create).not.toHaveBeenCalled();});
  it("pins same-repository previews to the head SHA and a separate environment",async()=>{const tx=fixture();expect(await githubPreview(tx as never,payload)).toBe("deployment-created:deployment");expect(tx.deployment.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({commitSha:"a".repeat(40),secretSnapshot:[],previewNumber:12,environmentId:"preview-env"})}));});
});
