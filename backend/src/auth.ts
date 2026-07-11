import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from './db.js';
import { config } from './config.js';
import { validate } from './middleware.js';

const router=Router();
const credentials=z.object({username:z.string().trim().min(3).max(254).transform(v=>v.toLowerCase()),password:z.string().min(8).max(128)});
const access=(id:string)=>jwt.sign({},config.JWT_ACCESS_SECRET,{subject:id,expiresIn:'15m'});
const refresh=(id:string)=>jwt.sign({},config.JWT_REFRESH_SECRET,{subject:id,expiresIn:'30d'});
const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
const equalHash=(left:string,right:string)=>{const a=Buffer.from(left,'hex'),b=Buffer.from(right,'hex');return a.length===b.length&&timingSafeEqual(a,b)};
const cookie={httpOnly:true,secure:config.NODE_ENV==='production',sameSite:(config.NODE_ENV==='production'?'none':'strict') as 'none'|'strict',path:'/api/auth',maxAge:30*24*60*60*1000};

router.post('/login',rateLimit({windowMs:15*60*1000,limit:5,standardHeaders:'draft-7',legacyHeaders:false}),validate(credentials),async(req,res)=>{const {username,password}=req.body;const users=await prisma.$queryRaw<Array<{id:string;username:string}>>`SELECT id, username FROM admin_user WHERE username=${username} AND replace(password_hash,'$2b$','$2a$')=crypt(${password},replace(password_hash,'$2b$','$2a$')) LIMIT 1`;const user=users[0];if(!user){req.log?.warn({event:'login_failure',username});res.status(401).json({error:'Invalid username or password'});return;}const token=refresh(user.id);await prisma.adminUser.update({where:{id:user.id},data:{refreshTokenHash:tokenHash(token)}});res.cookie('konooz_refresh',token,cookie);req.log?.info({event:'login_success',adminId:user.id});res.json({accessToken:access(user.id),admin:{username:user.username}});});
router.post('/refresh',async(req,res)=>{const token=req.cookies.konooz_refresh;if(!token){res.status(401).json({error:'Refresh token missing'});return;}try{const payload=jwt.verify(token,config.JWT_REFRESH_SECRET) as {sub:string};const user=await prisma.adminUser.findUnique({where:{id:payload.sub}});if(!user?.refreshTokenHash||!equalHash(tokenHash(token),user.refreshTokenHash))throw new Error();res.json({accessToken:access(user.id)});}catch{res.clearCookie('konooz_refresh',{path:'/api/auth'});res.status(401).json({error:'Refresh token invalid'});}});
router.post('/logout',async(req,res)=>{const token=req.cookies.konooz_refresh;try{const p=jwt.verify(token,config.JWT_REFRESH_SECRET) as {sub:string};await prisma.adminUser.update({where:{id:p.sub},data:{refreshTokenHash:null}});}catch{}res.clearCookie('konooz_refresh',{path:'/api/auth'});res.status(204).end();});
export default router;