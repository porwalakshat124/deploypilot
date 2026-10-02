import { describe, it, expect } from "vitest";
import { validateProfile } from "./build-profile.js";
const profile = { strategy: "DOCKERFILE", timeoutSeconds: 900, port: 3000, healthcheckPath: "/", requiredSecretNames: [] };
describe("build profile validation", () => {
  it("accepts a bounded Dockerfile configuration", () => expect(validateProfile({ ...profile, dockerContext: "app", dockerfilePath: "docker/Dockerfile", command: ["node", "server.js"] })).toMatchObject(profile));
  it.each(["../Dockerfile", "/etc/passwd", "C:\\Dockerfile", "-f", "repo/../secret"])("rejects path %s", dockerfilePath => expect(() => validateProfile({ ...profile, dockerfilePath })).toThrow());
  it.each([0, -1, 3601, "900", NaN])("rejects timeout %s", timeoutSeconds => expect(() => validateProfile({ ...profile, timeoutSeconds })).toThrow());
  it.each(["//evil.test/health", "https://evil.test/", "/\\evil.test", ""])("rejects health target %s", healthcheckPath => expect(() => validateProfile({ ...profile, healthcheckPath })).toThrow());
  it("rejects secret build arguments and malformed runtime secret names", () => {
    expect(() => validateProfile({ ...profile, buildArgs: { API_TOKEN: "secret" } })).toThrow();
    expect(() => validateProfile({ ...profile, requiredSecretNames: ["BAD-NAME"] })).toThrow();
  });
  it("validates and deduplicates BuildKit secret names",()=>{
    expect(validateProfile({...profile,buildSecretNames:["NPM_TOKEN","NPM_TOKEN"]})).toMatchObject({buildSecretNames:["NPM_TOKEN"]});
    expect(()=>validateProfile({...profile,buildSecretNames:["TOKEN,src=/secret"]})).toThrow();
    expect(()=>validateProfile({...profile,requiredSecretNames:Array.from({length:30},(_,i)=>"R"+i),buildSecretNames:Array.from({length:30},(_,i)=>"B"+i)})).toThrow("50 distinct");
  });
  it("does not silently ignore unsupported commands", () => expect(() => validateProfile({ ...profile, testCommand: "npm test" })).toThrow());
});
