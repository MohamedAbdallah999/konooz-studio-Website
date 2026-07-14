import {useLiveQuery} from 'dexie-react-hooks';
import {motion} from 'framer-motion';
import {ArrowUpRight,Package,ShoppingBag,TriangleAlert} from 'lucide-react';
import {Link} from 'react-router-dom';
import {db} from '../db';
import {paymentEvents} from '../payments';
import {SilkScene} from '../components/SilkScene';

const money=(n:number)=>new Intl.NumberFormat('en-EG',{style:'currency',currency:'EGP',maximumFractionDigits:0}).format(n);
const letter=(character:string,index:number)=><motion.span key={index} variants={{hidden:{opacity:0,y:38,scale:.8},visible:{opacity:1,y:0,scale:1,transition:{type:'spring',stiffness:240,damping:13,mass:.65}}}} style={{display:'inline-block',whiteSpace:'pre'}}>{character}</motion.span>;

export function Dashboard(){
  const data=useLiveQuery(async()=>{
    const items=await db.items.filter(x=>!x.deletedAt).toArray(),activeItemIds=new Set(items.map(item=>item.id)),variants=await db.variants.filter(x=>!x.deletedAt&&activeItemIds.has(x.itemId)).toArray(),sales=await db.sales.filter(x=>!x.deletedAt).toArray();
    const today=new Date().toDateString(),todaySales=sales.filter(s=>new Date(s.createdAt).toDateString()===today),revenue=sales.flatMap(paymentEvents).filter(event=>new Date(event.date).toDateString()===today).reduce((sum,event)=>sum+event.amount,0);
    return{models:items.length,pieces:variants.reduce((s,v)=>s+v.stockQuantity,0),low:variants.filter(v=>v.stockQuantity<=3).length,revenue,sales:todaySales.length};
  })??{models:0,pieces:0,low:0,revenue:0,sales:0};
  return <>
    <section className="hero">
      <SilkScene/>
      <div className="hero-copy">
        <p className="eyebrow">THE STYLE YOU LOVE</p>
        <motion.h2 className="animated-title" aria-label="Every dress has a story." initial="hidden" animate="visible" variants={{hidden:{},visible:{transition:{delayChildren:.22,staggerChildren:.04}}}}>
          <span aria-hidden="true">{[...'Every dress has'].map(letter)}</span><br/>
          <em aria-hidden="true">{[...'a story.'].map((character,index)=>letter(character,index+20))}</em>
        </motion.h2>
        <p>Keep the collection moving-from atelier floor to a customer's wardrobe.</p>
        <Link className="primary inline" to="/sell">Create a sale <ArrowUpRight size={18}/></Link>
      </div>
      <div className="hero-figure"><span>Today's revenue</span><strong>{money(data.revenue)}</strong><small>{data.sales} completed {data.sales===1?'sale':'sales'}</small></div>
    </section>
    <div className="stats">
      <article><Package/><span>Collection</span><strong>{data.models}</strong><small>dress models</small></article>
      <article><ShoppingBag/><span>In the atelier</span><strong>{data.pieces}</strong><small>pieces available</small></article>
      <article className={data.low?'warn':''}><TriangleAlert/><span>Needs attention</span><strong>{data.low}</strong><small>low-stock colours</small></article>
    </div>
    <section className="section-head"><div><p className="eyebrow">QUICK START</p><h2>What would you like to do?</h2></div></section>
    <div className="actions">
      <Link to="/inventory"><b>01</b><h3>Curate inventory</h3><p>Add a new model, colour or replenish stock.</p><ArrowUpRight/></Link>
      <Link to="/sell"><b>02</b><h3>Ring up a dress</h3><p>Build a sale and print a polished receipt.</p><ArrowUpRight/></Link>
      <Link to="/sales"><b>03</b><h3>Read the ledger</h3><p>Review daily totals and recent transactions.</p><ArrowUpRight/></Link>
    </div>
  </>;
}
