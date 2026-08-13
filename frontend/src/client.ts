const configuredBase=import.meta.env.VITE_API_URL??'http://localhost:4000/api';
const base=configuredBase.replace(/\/$/,'');
if(import.meta.env.PROD&&new URL(base).protocol!=='https:')throw new Error('Production API URL must use HTTPS.');
let token=sessionStorage.getItem('accessToken');
let activeRefresh:Promise<string|null>|null=null;
const clearAccessToken=()=>{token=null;sessionStorage.removeItem('accessToken')};

const refreshAccessToken=()=>activeRefresh??=(async()=>{
  try{
    const response=await fetch(base+'/auth/refresh',{method:'POST',credentials:'include',cache:'no-store'});
    if(!response.ok)throw new Error('Session refresh rejected');
    const next=(await response.json()).accessToken as string;
    token=next;sessionStorage.setItem('accessToken',next);return next;
  }catch{
    clearAccessToken();if(typeof window!=='undefined')dispatchEvent(new Event('konooz:auth-expired'));return null;
  }
})().finally(()=>{activeRefresh=null});
export const restoreSession=async()=>Boolean(await refreshAccessToken());

const delay=(milliseconds:number)=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function resilientFetch(url:string,init:RequestInit){
  const retryable=(init.method??'GET').toUpperCase()==='GET';
  for(let attempt=0;;attempt++){
    try{
      const response=await fetch(url,{...init,signal:init.signal??AbortSignal.timeout(15_000)});
      if(!retryable||attempt===2||(response.status!==429&&response.status<500))return response;
    }catch(error){
      if(!retryable||attempt===2)throw error;
    }
    await delay(500*2**attempt+Math.floor(Math.random()*250));
  }
}

export async function request(path:string,init:RequestInit={}){
  if(typeof navigator!=='undefined'&&!navigator.onLine)throw new Error('Internet connection required. No changes were saved.');
  const headers=new Headers(init.headers);if(init.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  if(token)headers.set('Authorization',`Bearer ${token}`);
  let response=await resilientFetch(base+path,{...init,headers,credentials:'include',cache:'no-store'});
  if(response.status===401&&path!=='/auth/refresh'){
    const refreshed=await refreshAccessToken();
    if(refreshed){headers.set('Authorization',`Bearer ${refreshed}`);response=await resilientFetch(base+path,{...init,headers,credentials:'include',cache:'no-store'})}
  }
  if(!response.ok)throw new Error((await response.json().catch(()=>({}))).error??'Request failed');
  return response.status===204?null:response.json();
}

export async function loginRequest(username:string,password:string){
  const data=await request('/auth/login',{method:'POST',body:JSON.stringify({username,password})});
  token=data.accessToken;sessionStorage.setItem('accessToken',token!);return data;
}
export async function logoutRequest(){try{await request('/auth/logout',{method:'POST'})}finally{clearAccessToken()}}
export const hasAccessToken=()=>{
  if(!token)return false;
  try{
    const encoded=token.split('.')[1];
    if(!encoded)return false;
    const normalized=encoded.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(encoded.length/4)*4,'=');
    const payload=JSON.parse(atob(normalized)) as {exp?:number;tokenUse?:string};
    return payload.tokenUse==='access'&&typeof payload.exp==='number'&&payload.exp*1000>Date.now()+30_000;
  }catch{return false;}
};
