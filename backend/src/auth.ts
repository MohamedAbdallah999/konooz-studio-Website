import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from './db.js';
import { config } from './config.js';
import { validate } from './middleware.js';

const router=Router();
const credentials=z.object({username:z.string().trim().min(3).max(254).transform(v=>v.toLowerCase()),password:z.string().min(8).max(128)});
const access=(id:string)=>jwt.sign({},config.JWT_ACCESS_SECRET,{subject:id,expiresIn:'15m'});
const refresh=(id:string,sessionId:string)=>jwt.sign({sid:sessionId},config.JWT_REFRESH_SECRET,{subject:id,expiresIn:'30d'});
const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
const equalHash=(left:string,right:string)=>{const a=Buffer.from(left,'hex'),b=Buffer.from(right,'hex');return a.length===b.length&&timingSafeEqual(a,b)};
const cookie={httpOnly:true,secure:config.NODE_ENV==='production',sameSite:(config.NODE_ENV==='production'?'none':'strict') as 'none'|'strict',path:'/api/auth',maxAge:30*24*60*60*1000};
const loginAttempts=new Map<string,{count:number;resetAt:number}>();
const loginLimit:import('express').RequestHandler=(req,res,next)=>{const key=req.ip??'unknown',now=Date.now(),current=loginAttempts.get(key);if(!current||current.resetAt<=now){loginAttempts.set(key,{count:1,resetAt:now+15*60_000});next();return;}if(current.count>=5){res.setHeader('Retry-After',String(Math.ceil((current.resetAt-now)/1000)));res.status(429).json({error:'Too many login attempts. Try again later.'});return;}current.count++;next();};

router.post('/login',loginLimit,validate(credentials),async(req,res)=>{const {username,password}=req.body;const users=await prisma.$queryRaw<Array<{id:string;username:string}>>`SELECT id, username FROM admin_user WHERE username=${username} AND replace(password_hash,'$2b$','$2a$')=crypt(${password},replace(password_hash,'$2b$','$2a$')) LIMIT 1`;const user=users[0];if(!user){console.warn(JSON.stringify({event:'login_failure',username}));res.status(401).json({error:'Invalid username or password'});return;}const sessionId=crypto.randomUUID(),token=refresh(user.id,sessionId);await prisma.$transaction([prisma.refreshSession.deleteMany({where:{expiresAt:{lt:new Date()}}}),prisma.refreshSession.create({data:{id:sessionId,adminId:user.id,tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+30*24*60*60*1000)}})]);res.cookie('konooz_refresh',token,cookie);console.info(JSON.stringify({event:'login_success',adminId:user.id,sessionId}));res.json({accessToken:access(user.id),admin:{username:user.username}});});
router.post('/refresh',async(req,res)=>{const token=req.cookies.konooz_refresh;if(!token){res.status(401).json({error:'Refresh token missing'});return;}try{const payload=jwt.verify(token,config.JWT_REFRESH_SECRET) as {sub:string;sid:string};const session=await prisma.refreshSession.findUnique({where:{id:payload.sid}});if(!session||session.adminId!==payload.sub||session.expiresAt<=new Date()||!equalHash(tokenHash(token),session.tokenHash))throw new Error();res.json({accessToken:access(payload.sub)});}catch{res.clearCookie('konooz_refresh',{path:'/api/auth'});res.status(401).json({error:'Refresh token invalid'});}});
router.post('/logout',async(req,res)=>{const token=req.cookies.konooz_refresh;try{const p=jwt.verify(token,config.JWT_REFRESH_SECRET) as {sid:string};if(p.sid)await prisma.refreshSession.deleteMany({where:{id:p.sid}});}catch{}res.clearCookie('konooz_refresh',{path:'/api/auth'});res.status(204).end();});
export default router;