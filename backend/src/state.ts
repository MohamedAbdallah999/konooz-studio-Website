import {Router} from 'express';
import {Prisma} from '@prisma/client';
import {prisma} from './db.js';

const router=Router();
router.get('/',async(_req,res)=>{
  const state=await prisma.$transaction(async tx=>{
    const [items,sales]=await Promise.all([
      tx.item.findMany({where:{deletedAt:null},include:{variants:{where:{deletedAt:null}}},orderBy:{updatedAt:'desc'}}),
      tx.sale.findMany({where:{deletedAt:null},include:{items:{include:{itemVariant:{include:{item:true}}}}},orderBy:{createdAt:'desc'},take:500}),
    ]);
    return{items,sales,serverTime:new Date().toISOString()};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  res.json(state);
});
export default router;
