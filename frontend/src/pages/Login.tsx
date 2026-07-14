import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {motion} from 'framer-motion';
import {ArrowRight,LockKeyhole} from 'lucide-react';
import {login} from '../api';
import {SilkScene} from '../components/SilkScene';

export function Login(){
  const nav=useNavigate(),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const submit=async(event:React.FormEvent)=>{event.preventDefault();setBusy(true);setError('');try{await login(username,password);nav('/')}catch(cause){setError(cause instanceof Error?cause.message:'Unable to sign in')}finally{setBusy(false)}};
  return <div className="login"><section className="login-brand"><SilkScene/><div className="login-copy"><img src="/brand/konooz-wordmark-transparent.png" alt="Konooz"/><p>THE STYLE YOU LOVE</p><h1>Your atelier,<br/><em>beautifully</em> in order.</h1><span>Inventory, sales and every treasured detail, securely connected to the shop database.</span></div></section><motion.section className="login-form" initial={{opacity:0,x:24}} animate={{opacity:1,x:0}}><form onSubmit={submit}><div className="lock"><LockKeyhole size={20}/></div><p className="eyebrow">PRIVATE ACCESS</p><h2>Welcome back</h2><p className="muted">Sign in to open the Konooz shop desk.</p><label>Email or username<input autoFocus autoComplete="username" value={username} onChange={event=>setUsername(event.target.value)} required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required/></label>{error&&<div className="error">{error}</div>}<button className="primary" disabled={busy}>{busy?'Opening atelier...':'Enter Konooz'}<ArrowRight size={18}/></button><small>Secure access to the live shop database</small></form></motion.section></div>;
}
