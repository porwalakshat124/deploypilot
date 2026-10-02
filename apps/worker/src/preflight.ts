export async function checkControlPlane(apiUrl:string,workerId:string,token:string) {
  const endpoint=new URL(apiUrl);
  if(endpoint.username || endpoint.password || (endpoint.protocol!=='https:' && !(endpoint.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)))) throw new Error('Worker preflight requires a trusted HTTPS API');
  const response=await fetch(endpoint.origin+'/v1/workers/'+encodeURIComponent(workerId)+'/runtimes',{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});
  await response.body?.cancel();
  if(!response.ok) throw new Error('Worker preflight failed: HTTP '+response.status);
}
