import {lazy,Suspense,useEffect,useState} from 'react';
import {BrowserRouter,Navigate,Route,Routes} from 'react-router-dom';
import {isAuthenticated,validateSession} from './api';
import {Shell} from './components/Shell';
import {Login} from './pages/Login';

const Dashboard=lazy(()=>import('./pages/Dashboard').then(module=>({default:module.Dashboard})));
const Inventory=lazy(()=>import('./pages/Inventory').then(module=>({default:module.Inventory})));
const Sales=lazy(()=>import('./pages/Sales').then(module=>({default:module.Sales})));
const Sell=lazy(()=>import('./pages/Sell').then(module=>({default:module.Sell})));

function Guard(){
  const [authenticated,setAuthenticated]=useState<boolean|null>(()=>isAuthenticated()?true:null);
  useEffect(()=>{if(authenticated!==null)return;let active=true;void validateSession().then(result=>{if(active)setAuthenticated(result)});return()=>{active=false}},[authenticated]);
  if(authenticated===null)return <div className="route-loading" role="status">Checking secure session…</div>;
  return authenticated?<Shell/>:<Navigate to="/login" replace/>;
}
export default function App(){
  return <BrowserRouter><Suspense fallback={<div className="route-loading" role="status">Loading…</div>}><Routes>
    <Route path="/login" element={<Login/>}/>
    <Route element={<Guard/>}>
      <Route index element={<Dashboard/>}/>
      <Route path="inventory" element={<Inventory/>}/>
      <Route path="sell" element={<Sell/>}/>
      <Route path="sales" element={<Sales/>}/>
    </Route>
    <Route path="*" element={<Navigate to="/"/>}/>
  </Routes></Suspense></BrowserRouter>;
}
