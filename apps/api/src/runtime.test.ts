import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { hashWorkerToken } from "./worker-auth.js";
const db = vi.hoisted(()=>({worker:{findUnique:vi.fn()},deploymentRuntime:{findFirst:vi.fn()},runtimeCommand:{findFirst:vi.fn(),update:vi.fn(),updateMany:vi.fn()},$queryRaw:vi.fn(),$transaction:vi.fn()}));
vi.mock("@deploypilot/database/client",()=>({db}));
import { RuntimeController } from "./runtime.controller.js";
const request={headers:{authorization:"Bearer fixture-token"}} as Request;
const controller=new RuntimeController({user:vi.fn().mockResolvedValue({id:"viewer"})} as never);
beforeEach(()=>{vi.clearAllMocks();db.$transaction.mockImplementation(fn=>fn(db));db.worker.findUnique.mockResolvedValue({id:"worker",repositoryId:"repo",tokenHash:hashWorkerToken("fixture-token")});});
describe("runtime control",()=>{
  it("rejects unauthorized runtime mutation before creating a command",async()=>{db.deploymentRuntime.findFirst.mockResolvedValue(null);await expect(controller.control(request,"deployment","stop")).rejects.toThrow("not found");expect(db.$transaction).not.toHaveBeenCalled();});
  it("claims retries with a new lease attempt and expires exhausted commands",async()=>{
    db.runtimeCommand.findFirst.mockResolvedValue({id:"cmd",action:"START",attempts:1,runtime:{deploymentId:"deployment"}});
    expect(await controller.claim(request,"worker")).toEqual({command:{id:"cmd",action:"START",attempt:2,deploymentId:"deployment"}});
    expect(db.runtimeCommand.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({attempts:{gte:3}}),data:expect.objectContaining({status:"FAILED"})}));
  });
  it("rechecks revocation after acquiring the worker lock",async()=>{
    db.worker.findUnique.mockResolvedValueOnce({id:"worker",repositoryId:"repo",tokenHash:hashWorkerToken("fixture-token")}).mockResolvedValueOnce({revokedAt:new Date(),tokenHash:hashWorkerToken("fixture-token")});
    await expect(controller.claim(request,"worker")).rejects.toThrow();
    expect(db.runtimeCommand.findFirst).not.toHaveBeenCalled();
  });
  it("does not acknowledge a stale command attempt",async()=>{
    db.runtimeCommand.updateMany.mockResolvedValue({count:0});
    await expect(controller.complete(request,"worker","cmd",{success:true,attempt:1})).rejects.toThrow("not found");
    expect(db.runtimeCommand.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({attempts:1,status:"RUNNING"})}));
  });
});
