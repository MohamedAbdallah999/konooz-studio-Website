const base=import.meta.env.VITE_API_URL??'http://localhost:4000/api';
let token=sessionStorage.getItem('accessToken');
let activeRefresh:Promise<string|null>|null=null;

const refreshAccessToken=()=>activeRefresh??=(async()=>{
  const response=await fetch(base+'/auth/refresh',{method:'POST',credentials:'include',cache:'no-store'});
  if(!response.ok)return null;
  const next=(await response.json()).accessToken as string;
  token=next;sessionStorage.setItem('accessToken',next);return next;
})().finally(()=>{activeRefresh=null});

export async function request(path:string,init:RequestInit={}){
  if(typeof navigator!=='undefined'&&!navigator.onLine)throw new Error('Internet connection required. No changes were saved.');
  const headers=new Headers(init.headers);headers.set('Content-Type','application/json');
  if(token)headers.set('Authorization',`Bearer ${token}`);
  let response=await fetch(base+path,{...init,headers,credentials:'include',cache:'no-store'});
  if(response.status===401&&path!=='/auth/refresh'){
    const refreshed=await refreshAccessToken();
    if(refreshed){headers.set('Authorization',`Bearer ${refreshed}`);response=await fetch(base+path,{...init,headers,credentials:'include',cache:'no-store'})}
  }
  if(!response.ok)throw new Error((await response.json().catch(()=>({}))).error??'Request failed');
  return response.status===204?null:response.json();
}

export async function loginRequest(username:string,password:string){
  const data=await request('/auth/login',{method:'POST',body:JSON.stringify({username,password})});
  token=data.accessToken;sessionStorage.setItem('accessToken',token!);return data;
}
export async function logoutRequest(){try{await request('/auth/logout',{method:'POST'})}finally{token=null;sessionStorage.removeItem('accessToken')}}
export const hasAccessToken=()=>Boolean(token);
