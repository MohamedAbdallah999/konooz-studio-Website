import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {AnimatePresence,motion} from 'framer-motion';
import type {Variants} from 'framer-motion';
import {ArrowRight,LoaderCircle,LockKeyhole} from 'lucide-react';
import {login} from '../api';
import {SilkScene} from '../components/SilkScene';

export function Login(){
  const nav=useNavigate(),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const submit=async(event:React.FormEvent)=>{event.preventDefault();setBusy(true);setError('');try{await login(username,password);nav('/')}catch(cause){setError(cause instanceof Error?cause.message:'Unable to sign in')}finally{setBusy(false)}};
  const reveal:Variants={hidden:{opacity:0,y:22},visible:{opacity:1,y:0,transition:{duration:.65,ease:[.16,1,.3,1]}}};
  return <div className="login">
    <section className="login-brand"><SilkScene/><motion.div className="login-copy" initial="hidden" animate="visible" variants={{hidden:{},visible:{transition:{staggerChildren:.1,delayChildren:.15}}}}><motion.img variants={reveal} src="/brand/konooz-wordmark-transparent.png" alt="Konooz"/><motion.p variants={reveal}>THE STYLE YOU LOVE</motion.p><motion.h1 variants={reveal}>Your atelier,<br/><em>beautifully</em> in order.</motion.h1><motion.span variants={reveal}>Inventory, sales and every treasured detail, securely connected to the shop database.</motion.span></motion.div></section>
    <motion.section className="login-form" initial={{opacity:0,x:34}} animate={{opacity:1,x:0}} transition={{duration:.8,ease:[.16,1,.3,1]}}><motion.form onSubmit={submit} initial="hidden" animate="visible" variants={{hidden:{},visible:{transition:{staggerChildren:.065,delayChildren:.18}}}}>{[<div className="lock" key="lock"><LockKeyhole size={20}/></div>,<p className="eyebrow" key="access">PRIVATE ACCESS</p>,<h2 key="welcome">Welcome back</h2>,<p className="muted" key="copy">Sign in to open the Konooz shop desk.</p>].map((content,index)=><motion.div className="login-reveal" variants={reveal} key={index}>{content}</motion.div>)}<motion.label variants={reveal}>Email or username<input autoFocus autoComplete="username" value={username} onChange={event=>setUsername(event.target.value)} required/></motion.label><motion.label variants={reveal}>Password<input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required/></motion.label><AnimatePresence>{error&&<motion.div className="error" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0}}>{error}</motion.div>}</AnimatePresence><motion.button variants={reveal} className="primary login-submit" disabled={busy}>{busy?<><LoaderCircle className="spin"/>Opening atelier...</>:<>Enter Konooz<ArrowRight size={18}/></>}</motion.button><motion.small variants={reveal}>Secure access to the live shop database</motion.small></motion.form></motion.section>
  </div>;
}
