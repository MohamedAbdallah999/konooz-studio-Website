export function LoadingScreen(){
  return <div className="app-loader" role="status" aria-live="polite">
    <div className="loader-mark" aria-hidden="true"><span>K</span><i/><i/><i/></div>
    <img src="/brand/konooz-wordmark-transparent.png" alt=""/>
    <p>Preparing your atelier</p>
  </div>;
}
