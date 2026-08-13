# Shared components

## Shell

Source: `frontend/src/components/Shell.tsx`

```tsx
import {useEffect} from 'react';
import {NavLink,Outlet,useNavigate} from 'react-router-dom';
import {LayoutDashboard,Package,ReceiptText,ShoppingBag,LogOut,Wifi,WifiOff,RefreshCw} from 'lucide-react';
import {motion} from 'framer-motion';
import {clearSessionCache,logout} from '../api';
import {useSync} from '../hooks/useSync';

const nav=[[LayoutDashboard,'Overview','/'],[Package,'Inventory','/inventory'],[ShoppingBag,'New sale','/sell'],[ReceiptText,'Sales','/sales']] as const;
export function Shell(){
  const navigate=useNavigate(),sync=useSync();
  useEffect(()=>{const expired=()=>{void clearSessionCache().finally(()=>navigate('/login',{replace:true}))};addEventListener('konooz:auth-expired',expired);return()=>removeEventListener('konooz:auth-expired',expired)},[navigate]);
  const signOut=async()=>{try{await logout()}finally{navigate('/login')}};
  return <div className="app-shell">
    <aside className="sidebar">
      <img src="/brand/konooz-wordmark-transparent.png" className="side-logo" alt="Konooz"/>
      <nav>{nav.map(([Icon,label,to])=><NavLink key={to} to={to} end={to==='/'}><Icon size={20}/><span>{label}</span></NavLink>)}</nav>
      <button className="logout" onClick={signOut}><LogOut size={18}/> Sign out</button>
    </aside>
    <main>
      <header className="topbar"><div><p className="eyebrow">ATELIER OPERATIONS</p><h1>Good Morning, Dewidar</h1></div><button className={`sync-pill ${sync.online?'online':'offline'}`} title={sync.error||undefined} onClick={()=>dispatchEvent(new Event('konooz:sync-request'))} aria-label={sync.error?`Refresh failed: ${sync.error}`:sync.syncing?'Refreshing data':sync.online?'Refresh data':'Browser is offline'}>{sync.syncing?<RefreshCw className="spin" size={15}/>:sync.online?<Wifi size={15}/>:<WifiOff size={15}/>}<span>{sync.syncing?'Refreshing':sync.error?'Retry sync':sync.online?'Live data':'No internet'}</span></button></header>
      <motion.div className="page" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:.28}}><Outlet/></motion.div>
    </main>
    <nav className="mobile-nav" aria-label="Main navigation">
      {nav.map(([Icon,label,to])=><NavLink key={to} to={to} end={to==='/'}><Icon size={21}/><span>{label}</span></NavLink>)}
      <button className="mobile-logout" onClick={signOut}><LogOut size={21}/><span>Sign out</span></button>
    </nav>
  </div>
}
```

## AnimatedTitle

Source: `frontend/src/components/AnimatedTitle.tsx`

```tsx
import {motion,useReducedMotion} from 'framer-motion';

type Props={children:string;className?:string};

export function AnimatedTitle({children,className}:Props){
  const reduceMotion=useReducedMotion();
  if(reduceMotion)return <h2 className={className}>{children}</h2>;
  return <motion.h2
    className={`animated-title ${className??''}`.trim()}
    aria-label={children}
    initial="hidden"
    animate="visible"
    variants={{hidden:{},visible:{transition:{delayChildren:.08,staggerChildren:.045}}}}
  >
    <span aria-hidden="true">
      {[...children].map((character,index)=><motion.span
        key={index}
        variants={{hidden:{opacity:0,y:28,scale:.86},visible:{opacity:1,y:0,scale:1,transition:{type:'spring',stiffness:240,damping:13,mass:.65}}}}
        style={{display:'inline-block',whiteSpace:'pre'}}
      >{character}</motion.span>)}
    </span>
  </motion.h2>;
}
```

## NumberInput

Source: `frontend/src/components/NumberInput.tsx`

```tsx
import type { InputHTMLAttributes, WheelEvent } from 'react';

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function NumberInput({ onFocus, onWheel, ...props }: NumberInputProps) {
  return (
    <input {...props} type='number'
      onFocus={(event) => {
        if (/^-?0(?:\.0*)?$/.test(event.currentTarget.value)) event.currentTarget.select();
        onFocus?.(event);
      }}
      onWheel={(event: WheelEvent<HTMLInputElement>) => {
        event.currentTarget.blur();
        event.preventDefault();
        onWheel?.(event);
      }}
    />
  );
}
```

## SilkScene

Source: `frontend/src/components/SilkScene.tsx`

```tsx
export function SilkScene(){return <div className="silk" aria-hidden="true"><span/><span/><span/></div>}
```

