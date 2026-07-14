import {Router} from 'express';
import {Prisma} from '@prisma/client';
import {prisma} from './db.js';

const router=Router();
const versionQuery=Prisma.sql`SELECT COALESCE(MAX(updated_at), TIMESTAMP 'epoch')::text AS version FROM (SELECT updated_at FROM items UNION ALL SELECT updated_at FROM item_variants UNION ALL SELECT updated_at FROM sales UNION ALL SELECT updated_at FROM sale_items) changes`;

router.get('/',async(req,res)=>{
  const current=(await prisma.$queryRaw<Array<{version:string}>>(versionQuery))[0]?.version??'epoch';
  if(req.query.version===current){res.json({unchanged:true,version:current});return}
  const state=await prisma.$transaction(async tx=>{
    const [items,sales,versionRows]=await Promise.all([
      tx.item.findMany({where:{deletedAt:null},include:{variants:{where:{deletedAt:null}}},orderBy:{updatedAt:'desc'}}),
      tx.sale.findMany({
        where:{deletedAt:null},orderBy:{createdAt:'desc'},take:500,
        include:{items:{include:{itemVariant:{select:{id:true,itemId:true,size:true,color:true,stockQuantity:true,deletedAt:true,createdAt:true,updatedAt:true,syncStatus:true,item:{select:{id:true,modelNumber:true,price:true,createdAt:true,updatedAt:true,syncStatus:true,deletedAt:true}}}}}}},
      }),
      tx.$queryRaw<Array<{version:string}>>(versionQuery),
    ]);
    return{items,sales,version:versionRows[0]?.version??current,serverTime:new Date().toISOString()};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  res.json(state);
});
export default router;
