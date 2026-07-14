import {useState} from 'react';
import {AnimatePresence,motion} from 'framer-motion';
import {ArrowRight,LoaderCircle,LockKeyhole} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {login} from '../api';
import {SilkScene} from '../components/SilkScene';

export function Login(){
  const nav=useNavigate();
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true);setError('');
    try{await login(username,password);nav('/')}
    catch(cause){setError(cause instanceof Error?cause.message:'Unable to sign in')}
    finally{setBusy(false)}
  };
  return <div className="login">
    <section className="login-brand">
      <SilkScene/>
      <motion.div className="login-copy" initial={{opacity:0,x:-28}} animate={{opacity:1,x:0}} transition={{duration:.8,ease:[.16,1,.3,1]}}>
        <img src="/brand/konooz-wordmark-transparent.png" alt="Konooz"/>
        <p>THE STYLE YOU LOVE</p>
        <h1>Your atelier,<br/><em>beautifully</em> in order.</h1>
        <span>Inventory, sales and every treasured detail, securely connected to the shop database.</span>
      </motion.div>
    </section>
    <section className="login-form">
      <motion.form onSubmit={submit} initial={{opacity:0,x:28}} animate={{opacity:1,x:0}} transition={{duration:.75,delay:.12,ease:[.16,1,.3,1]}}>
        <div className="lock"><LockKeyhole size={20}/></div>
        <p className="eyebrow">PRIVATE ACCESS</p>
        <h2>Welcome back</h2>
        <p className="muted">Sign in to open the Konooz shop desk.</p>
        <label>Email or username<input autoFocus autoComplete="username" value={username} onChange={event=>setUsername(event.target.value)} required/></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required/></label>
        <AnimatePresence>{error&&<motion.div className="error" initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>{error}</motion.div>}</AnimatePresence>
        <button className="primary login-submit" disabled={busy}>{busy?<><LoaderCircle className="spin"/>Opening atelier...</>:<>Enter Konooz<ArrowRight size={18}/></>}</button>
        <small>Secure access to the live shop database</small>
      </motion.form>
    </section>
  </div>;
}
