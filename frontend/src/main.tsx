import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
if('serviceWorker' in navigator)void navigator.serviceWorker.getRegistrations().then(registrations=>Promise.all(registrations.map(registration=>registration.unregister())));
if('caches' in globalThis)void caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key))));
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
const selectInitialZero=(event:Event)=>{const input=event.target;if(input instanceof HTMLInputElement&&input.type==='number'&&input.value==='0')input.select()};
document.addEventListener('focusin',selectInitialZero);
document.addEventListener('pointerup',selectInitialZero);
document.addEventListener('beforeinput',selectInitialZero);
