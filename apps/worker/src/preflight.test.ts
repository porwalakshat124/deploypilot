import {afterEach,it,expect,vi} from 'vitest';
import {checkControlPlane} from './preflight.js';
afterEach(()=>vi.unstubAllGlobals());
it('uses authenticated read-only preflight and rejects denied credentials',async()=>{
  const mock=vi.fn().mockResolvedValue(new Response('{}',{status:200}));vi.stubGlobal('fetch',mock);
  await checkControlPlane('https://example.test','worker','test-only');
  expect(mock.mock.calls[0][0]).toBe('https://example.test/v1/workers/worker/runtimes');
  expect(mock.mock.calls[0][1]).toMatchObject({redirect:'error',headers:{Authorization:'Bearer test-only'}});
  expect(mock.mock.calls[0][1]).not.toHaveProperty('method');
  mock.mockResolvedValue(new Response('',{status:401}));
  await expect(checkControlPlane('https://example.test','worker','bad')).rejects.toThrow('HTTP 401');
});
it('rejects remote plaintext and URL credentials before contacting the host',async()=>{
  const mock=vi.fn();vi.stubGlobal('fetch',mock);
  await expect(checkControlPlane('http://example.test','worker','test')).rejects.toThrow('HTTPS');
  await expect(checkControlPlane('https://user:password@example.test','worker','test')).rejects.toThrow('HTTPS');
  expect(mock).not.toHaveBeenCalled();
});
