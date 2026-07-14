import {useState} from 'react';
import {motion,useReducedMotion} from 'framer-motion';
import {useNavigate} from 'react-router-dom';
import {ArrowRight,LoaderCircle,LockKeyhole} from 'lucide-react';
import {login} from '../api';
import {SilkScene} from '../components/SilkScene';

const letters=(text:string,prefix:string)=>[...text].map((character,index)=><motion.span key={prefix+index} variants={{hidden:{opacity:0,y:34,scale:.82},visible:{opacity:1,y:0,scale:1,transition:{type:'spring',stiffness:240,damping:13,mass:.65}}}} style={{display:'inline-block',whiteSpace:'pre'}}>{character}</motion.span>);
function LoginTitle(){
  const reduceMotion=useReducedMotion();
  if(reduceMotion)return <h1>Your atelier,<br/><em>beautifully</em> in order.</h1>;
  return <motion.h1 className="animated-login-title" aria-label="Your atelier, beautifully in order." initial="hidden" animate="visible" variants={{hidden:{},visible:{transition:{delayChildren:.12,staggerChildren:.04}}}}><span aria-hidden="true">{letters('Your atelier,','a')}</span><br/><em aria-hidden="true">{letters('beautifully','b')}</em><span aria-hidden="true">{letters(' in order.','c')}</span></motion.h1>;
}

export function Login(){
  const nav=useNavigate(),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const submit=async(event:React.FormEvent)=>{event.preventDefault();setBusy(true);setError('');try{await login(username,password);nav('/')}catch(cause){setError(cause instanceof Error?cause.message:'Unable to sign in')}finally{setBusy(false)}};
  return <div className="login"><section className="login-brand"><SilkScene/><div className="login-copy"><img src="/brand/konooz-wordmark-transparent.png" alt="Konooz"/><p>THE STYLE YOU LOVE</p><LoginTitle/><span>Inventory, sales and every treasured detail, securely connected to the shop database.</span></div></section><section className="login-form"><form onSubmit={submit}><div className="lock"><LockKeyhole size={20}/></div><p className="eyebrow">PRIVATE ACCESS</p><h2>Welcome back</h2><p className="muted">Sign in to open the Konooz shop desk.</p><label>Email or username<input autoFocus autoComplete="username" value={username} onChange={event=>setUsername(event.target.value)} required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required/></label>{error&&<div className="error">{error}</div>}<button className="primary login-submit" disabled={busy}>{busy?<><LoaderCircle className="spin"/>Opening atelier...</>:<>Enter Konooz<ArrowRight size={18}/></>}</button><small>Secure access to the live shop database</small></form></section></div>;
}
