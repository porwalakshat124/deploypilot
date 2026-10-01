import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ candidates: vi.fn(), logs: vi.fn(), aggregate: vi.fn(), eligible: vi.fn(), remove: vi.fn(), event: vi.fn(), archive: vi.fn(), transaction: vi.fn() }));
vi.mock("@deploypilot/database/client", () => ({ db: { deployment: { findMany: mocks.candidates }, deploymentLog: { findMany: mocks.logs }, $transaction: mocks.transaction } }));
vi.mock("./r2.service.js", () => ({ r2: { configured: () => true, archiveLogs: mocks.archive } }));
import { retainLogs } from "./log-retention.js";
beforeEach(() => {
  vi.clearAllMocks(); mocks.candidates.mockResolvedValue([{id:"old-deployment"}]); mocks.logs.mockResolvedValue([{sequence:1}]);
  mocks.eligible.mockResolvedValue({id:"old-deployment"}); mocks.aggregate.mockResolvedValue({_count:1,_max:{sequence:1}});
  mocks.archive.mockResolvedValue({verified:true,lineCount:1,key:"archive",sha256:"digest"});
  mocks.transaction.mockImplementation(fn => fn({deployment:{findFirst:mocks.eligible},deploymentLog:{aggregate:mocks.aggregate,deleteMany:mocks.remove},deploymentEvent:{create:mocks.event}}));
});
it("compacts only old terminal logs after verifying their complete archive", async () => {
  expect(await retainLogs(new Date("2026-10-02"))).toEqual({compacted:1});
  expect(mocks.candidates).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({endedAt:{lt:new Date("2026-09-02")},effects:{some:{kind:"archive",status:"SUCCEEDED"}}})}));
  expect(mocks.remove).toHaveBeenCalledWith({where:{deploymentId:"old-deployment"}});
  expect(mocks.event).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({type:"logs.retained"})}));
});
it("preserves logs if offsite verification fails", async () => { mocks.archive.mockRejectedValue(new Error("checksum")); await expect(retainLogs()).rejects.toThrow("checksum"); expect(mocks.remove).not.toHaveBeenCalled(); });
it("preserves rows appended while the archive was uploading", async () => { mocks.aggregate.mockResolvedValue({_count:2,_max:{sequence:2}}); expect(await retainLogs()).toEqual({compacted:0}); expect(mocks.remove).not.toHaveBeenCalled(); });
it("rechecks eligibility before deleting any rows", async () => { mocks.eligible.mockResolvedValue(null); expect(await retainLogs()).toEqual({compacted:0}); expect(mocks.remove).not.toHaveBeenCalled(); });
