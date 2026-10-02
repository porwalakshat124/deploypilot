import {afterEach,describe,expect,it,vi} from "vitest";
const send=vi.hoisted(()=>vi.fn());
vi.mock("@aws-sdk/client-s3",()=>({S3Client:class {send=send;},GetObjectCommand:class{},PutObjectCommand:class{},DeleteObjectCommand:class {constructor(public input:unknown){}},ListObjectsV2Command:class {constructor(public input:unknown){}}}));
vi.mock("@aws-sdk/s3-request-presigner",()=>({getSignedUrl:vi.fn()}));
import {R2Service} from "./r2.service.js";
afterEach(()=>{vi.unstubAllEnvs();send.mockReset();});
function configured(){for(const key of ["R2_ENDPOINT","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY","R2_BUCKET"]) vi.stubEnv(key,"test");return new R2Service();}
describe("bounded private storage inventory",()=>{
  it("expires only a fixed deployment log key and rejects arbitrary paths",async()=>{
    const service=configured();send.mockResolvedValue({});
    const id="12345678-1234-1234-1234-123456789012";
    await service.expireLogArchive(id);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({input:{Bucket:"test",Key:`deployments/${id}/logs.jsonl`}}));
    await expect(service.expireLogArchive("../backups/key")).rejects.toThrow("Invalid");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("aggregates pagination without returning object keys or exposing deletion",async()=>{
    send.mockResolvedValueOnce({Contents:[{Key:"backups/private",Size:3}],IsTruncated:true,NextContinuationToken:"next"}).mockResolvedValueOnce({Contents:[{Size:4}],IsTruncated:false}).mockResolvedValueOnce({Contents:[{Size:5}],IsTruncated:false});
    const result=await configured().inventory();
    expect(result.groups).toEqual([{prefix:"backups/",count:2,bytes:7,truncated:false},{prefix:"deployments/",count:1,bytes:5,truncated:false}]);
    expect(JSON.stringify(result)).not.toContain("backups/private");
    expect(result.deletionEnabled).toBe(false);
  });
  it("bounds pagination and labels incomplete usage as truncated",async()=>{
    let index=0;send.mockImplementation(async()=>({Contents:[{Size:1}],IsTruncated:true,NextContinuationToken:String(++index)}));
    const result=await configured().inventory();
    expect(send).toHaveBeenCalledTimes(20);
    expect(result.groups?.every(group=>group.truncated && group.count===10)).toBe(true);
  });
});
