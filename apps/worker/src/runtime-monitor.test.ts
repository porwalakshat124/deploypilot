import { describe,it,expect,vi,afterEach } from "vitest";
import { RuntimeMonitor } from "./runtime-monitor.js";
afterEach(()=>vi.unstubAllGlobals());
describe("runtime monitor",()=>{
  it("reports health and acknowledges the exact command lease",async()=>{
    const api={runtimeCommand:vi.fn().mockResolvedValue({command:{id:"cmd",attempt:2,action:"START",deploymentId:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}}),completeRuntimeCommand:vi.fn(),runtimes:vi.fn().mockResolvedValue({runtimes:[{id:"runtime",deploymentId:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",deployment:{config:{profile:{port:3000,healthcheckPath:"/health"}}}}]}),reportRuntime:vi.fn()};
    const docker={runtimeAction:vi.fn(),running:vi.fn().mockResolvedValue(true),runtimeEndpoint:vi.fn().mockResolvedValue("http://127.0.0.1:1234")};
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("ok",{status:200})));
    await new RuntimeMonitor(docker as never).tick(api as never);
    expect(api.completeRuntimeCommand).toHaveBeenCalledWith("cmd",true,2);
    expect(api.reportRuntime).toHaveBeenCalledWith("runtime","HEALTHY","http://127.0.0.1:1234");
  });
});
