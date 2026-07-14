import {useEffect,useState} from 'react';

export function LoadingScreen(){
  return <div className="app-loader" role="status" aria-live="polite">
    <div className="loader-mark" aria-hidden="true"><span>K</span><i/><i/><i/></div>
    <img src="/brand/konooz-wordmark-transparent.png" alt=""/>
    <p>Preparing your atelier</p>
  </div>;
}

export function DelayedLoadingScreen(){
  const [visible,setVisible]=useState(false);
  useEffect(()=>{const timer=window.setTimeout(()=>setVisible(true),250);return()=>clearTimeout(timer)},[]);
  return visible?<LoadingScreen/>:null;
}
