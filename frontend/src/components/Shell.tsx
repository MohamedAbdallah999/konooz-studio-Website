import {NavLink,Outlet,useNavigate} from 'react-router-dom';
import {LayoutDashboard,Package,ReceiptText,ShoppingBag,LogOut,Wifi,WifiOff,RefreshCw} from 'lucide-react';
import {motion} from 'framer-motion';
import {logout} from '../api';
import {useSync} from '../hooks/useSync';

const nav=[[LayoutDashboard,'Overview','/'],[Package,'Inventory','/inventory'],[ShoppingBag,'New sale','/sell'],[ReceiptText,'Sales','/sales']] as const;
export function Shell(){
  const navigate=useNavigate(),sync=useSync();
  const signOut=async()=>{try{await logout()}finally{navigate('/login')}};
  return <div className="app-shell">
    <aside className="sidebar">
      <img src="/brand/konooz-wordmark-transparent.png" className="side-logo" alt="Konooz"/>
      <nav>{nav.map(([Icon,label,to])=><NavLink key={to} to={to} end={to==='/'}><Icon size={20}/><span>{label}</span></NavLink>)}</nav>
      <button className="logout" onClick={signOut}><LogOut size={18}/> Sign out</button>
    </aside>
    <main>
      <header className="topbar"><div><p className="eyebrow">ATELIER OPERATIONS</p><h1>Good Morning, Dewidar</h1></div><button className={`sync-pill ${sync.online?'online':'offline'}`} onClick={()=>dispatchEvent(new Event('konooz:sync-request'))} aria-label={sync.syncing?'Refreshing data':sync.online?'Refresh data':'Browser is offline'}>{sync.syncing?<RefreshCw className="spin" size={15}/>:sync.online?<Wifi size={15}/>:<WifiOff size={15}/>}<span>{sync.syncing?'Refreshing':sync.online?'Live data':'No internet'}</span></button></header>
      <motion.div className="page" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:.28}}><Outlet/></motion.div>
    </main>
    <nav className="mobile-nav" aria-label="Main navigation">
      {nav.map(([Icon,label,to])=><NavLink key={to} to={to} end={to==='/'}><Icon size={21}/><span>{label}</span></NavLink>)}
      <button className="mobile-logout" onClick={signOut}><LogOut size={21}/><span>Sign out</span></button>
    </nav>
  </div>
}
