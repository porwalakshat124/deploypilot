import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {DockerAdapter} from './docker-adapter.js';
describe.skipIf(process.env.DOCKER_SOAK!=='1')('bounded local concurrent build/restart soak',()=>{
  it('completes six builds across two lanes with repeated health requests and restarts',async()=>{
    const profile={strategy:'DOCKERFILE' as const,timeoutSeconds:180,port:3000,healthcheckPath:'/health',requiredSecretNames:[]};
    const policy={timeoutSeconds:180,memoryLimitMb:512,cpuLimit:1,pidsLimit:128,networkMode:'bridge' as const};
    const context=fileURLToPath(new URL('./fixtures/healthy',import.meta.url));
    await Promise.all(Array.from({length:2},async()=>{
      for(let cycle=0;cycle<3;cycle++) {
        const docker=new DockerAdapter(),name='deploypilot-soak-'+randomUUID();
        try {
          await docker.build(name,context,profile,policy);
          await docker.start(name,name,profile,policy,{});
          for(let restart=0;restart<3;restart++) {
            const endpoint=await docker.health(name,profile,{});
            for(let batch=0;batch<5;batch++) await Promise.all(Array.from({length:4},async()=>{
              const response=await fetch(endpoint+'/health',{signal:AbortSignal.timeout(5000)});
              await response.body?.cancel(); expect(response.status).toBe(200);
            }));
            if(restart<2) await docker.runtimeAction(name,'RESTART');
          }
          await docker.runtimeAction(name,'STOP'); expect(await docker.running(name)).toBe(false);
          await docker.runtimeAction(name,'START'); expect(await docker.health(name,profile,{})).toMatch(/^http:\/\/127\.0\.0\.1:/);
        } finally {await docker.cleanup(name,name);}
      }
    }));
  },600000);
});
