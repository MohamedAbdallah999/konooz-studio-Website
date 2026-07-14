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
