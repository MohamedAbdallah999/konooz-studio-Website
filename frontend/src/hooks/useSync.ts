import {useEffect,useState} from 'react';
import {syncNow} from '../api';

export function useSync(){
  const [online,setOnline]=useState(navigator.onLine),[syncing,setSyncing]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    let retryTimer:number|undefined,retryDelay=1_000,stopped=false;
    const run=async()=>{
      clearTimeout(retryTimer);
      if(!navigator.onLine){setOnline(false);setSyncing(false);return}
      setOnline(true);setSyncing(true);
      try{await syncNow();if(!stopped){setError('');retryDelay=1_000}}
      catch(cause){if(!stopped){setError(cause instanceof Error?cause.message:'Sync failed');retryTimer=window.setTimeout(run,retryDelay);retryDelay=Math.min(retryDelay*2,30_000)}}
      finally{if(!stopped)setSyncing(false)}
    };
    const changed=()=>{void run()};
    const off=()=>{clearTimeout(retryTimer);setOnline(false);setSyncing(false)};
    const visible=()=>{if(document.visibilityState==='visible')run()};
    let channel:BroadcastChannel|null=null;
    try{channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('konooz-sync')}catch{channel=null}
    if(channel)channel.onmessage=changed;
    addEventListener('online',run);addEventListener('offline',off);addEventListener('focus',run);addEventListener('konooz:data-changed',changed);addEventListener('konooz:sync-request',run);document.addEventListener('visibilitychange',visible);
    run();const interval=setInterval(run,30_000);
    return()=>{stopped=true;channel?.close();removeEventListener('online',run);removeEventListener('offline',off);removeEventListener('focus',run);removeEventListener('konooz:data-changed',changed);removeEventListener('konooz:sync-request',run);document.removeEventListener('visibilitychange',visible);clearInterval(interval);clearTimeout(retryTimer)};
  },[]);
  return{online,syncing,error};
}
