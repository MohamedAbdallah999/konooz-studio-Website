import {lazy,Suspense} from 'react';
import {BrowserRouter,Navigate,Route,Routes} from 'react-router-dom';
import {isAuthenticated} from './api';
import {Shell} from './components/Shell';
import {LoadingScreen} from './components/LoadingScreen';

const Dashboard=lazy(()=>import('./pages/Dashboard').then(module=>({default:module.Dashboard})));
const Inventory=lazy(()=>import('./pages/Inventory').then(module=>({default:module.Inventory})));
const Login=lazy(()=>import('./pages/Login').then(module=>({default:module.Login})));
const Sales=lazy(()=>import('./pages/Sales').then(module=>({default:module.Sales})));
const Sell=lazy(()=>import('./pages/Sell').then(module=>({default:module.Sell})));

function Guard(){return isAuthenticated()?<Shell/>:<Navigate to="/login" replace/>}
export default function App(){
  return <BrowserRouter><Suspense fallback={<LoadingScreen/>}><Routes>
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
