import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles.css";
registerSW({ immediate: true });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
const selectInitialZero=(event:Event)=>{const input=event.target;if(input instanceof HTMLInputElement&&input.type==='number'&&input.value==='0')input.select()};
document.addEventListener('focusin',selectInitialZero);
document.addEventListener('pointerup',selectInitialZero);
document.addEventListener('beforeinput',selectInitialZero);
