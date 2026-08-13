import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from './db.js';
import { config, jwtIdentity, jwtVerifyConfig } from './config.js';
import { sameOrigin, validate } from './middleware.js';

const router=Router();
const credentials=z.object({username:z.string().trim().min(3).max(254).transform(v=>v.toLowerCase()),password:z.string().min(8).max(128)});
const access=(id:string)=>jwt.sign({tokenUse:'access'},config.JWT_ACCESS_SECRET,{...jwtIdentity,algorithm:'HS256',subject:id,expiresIn:'15m'});
const refresh=(id:string,sessionId:string)=>jwt.sign({sid:sessionId,tokenUse:'refresh'},config.JWT_REFRESH_SECRET,{...jwtIdentity,algorithm:'HS256',subject:id,jwtid:crypto.randomUUID(),expiresIn:'30d'});
const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
const equalHash=(left:string,right:string)=>timingSafeEqual(createHash('sha256').update(left).digest(),createHash('sha256').update(right).digest());
const cookie={httpOnly:true,secure:config.NODE_ENV==='production',sameSite:(config.NODE_ENV==='production'?'none':'strict') as 'none'|'strict',path:'/api/auth',maxAge:30*24*60*60*1000};
const clearCookie={httpOnly:true,secure:config.NODE_ENV==='production',sameSite:(config.NODE_ENV==='production'?'none':'strict') as 'none'|'strict',path:'/api/auth'};
const windowMilliseconds=15*60_000;
const rateKey=(scope:string,value:string)=>tokenHash(`${scope}:${value}`);
const retryAfter=async(keys:string[])=>{
  const now=new Date();
  const blocked=await prisma.loginRateLimit.findFirst({where:{key:{in:keys},blockedUntil:{gt:now}},orderBy:{blockedUntil:'desc'}});
  return blocked?.blockedUntil?Math.max(1,Math.ceil((blocked.blockedUntil.getTime()-now.getTime())/1000)):0;
};
const registerFailure=async(key:string,threshold:number)=>{
  const now=new Date(),windowStart=new Date(now.getTime()-windowMilliseconds),blockedUntil=new Date(now.getTime()+windowMilliseconds);
  const rows=await prisma.$queryRaw<Array<{blocked_until:Date|null}>>`
    INSERT INTO login_rate_limits (key,failure_count,window_started_at,blocked_until,updated_at)
    VALUES (${key},1,${now}::timestamp,NULL,${now}::timestamp)
    ON CONFLICT (key) DO UPDATE SET
      failure_count=CASE WHEN login_rate_limits.window_started_at<${windowStart}::timestamp THEN 1 ELSE login_rate_limits.failure_count+1 END,
      window_started_at=CASE WHEN login_rate_limits.window_started_at<${windowStart}::timestamp THEN ${now}::timestamp ELSE login_rate_limits.window_started_at END,
      blocked_until=CASE
        WHEN (CASE WHEN login_rate_limits.window_started_at<${windowStart}::timestamp THEN 1 ELSE login_rate_limits.failure_count+1 END)>=${threshold} THEN ${blockedUntil}::timestamp
        ELSE NULL
      END,
      updated_at=${now}::timestamp
    RETURNING blocked_until
  `;
  return rows[0]?.blocked_until??null;
};

router.post('/login',sameOrigin,validate(credentials),async(req,res)=>{
  const {username,password}=req.body;
  const keys=[rateKey('account',username),rateKey('ip',req.header('cf-connecting-ip')??req.ip??'unknown')];
  const wait=await retryAfter(keys);
  if(wait){res.setHeader('Retry-After',String(wait));res.status(429).json({error:'Too many login attempts. Try again later.'});return;}
  const users=await prisma.$queryRaw<Array<{id:string;username:string}>>`SELECT id, username FROM admin_user WHERE username=${username} AND replace(password_hash,'$2b$','$2a$')=crypt(${password},replace(password_hash,'$2b$','$2a$')) LIMIT 1`;
  const user=users[0];
  if(!user){
    const blocked=await Promise.all([registerFailure(keys[0]!,5),registerFailure(keys[1]!,20)]);
    await prisma.loginRateLimit.deleteMany({where:{updatedAt:{lt:new Date(Date.now()-24*60*60_000)}}});
    console.warn(JSON.stringify({event:'login_failure',requestId:req.requestId}));
    if(blocked.some(Boolean)){res.setHeader('Retry-After',String(windowMilliseconds/1000));res.status(429).json({error:'Too many login attempts. Try again later.'});return;}
    res.status(401).json({error:'Invalid username or password'});return;
  }
  const sessionId=crypto.randomUUID(),token=refresh(user.id,sessionId);
  await prisma.$transaction([
    prisma.refreshSession.deleteMany({where:{expiresAt:{lt:new Date()}}}),
    prisma.loginRateLimit.deleteMany({where:{key:{in:keys}}}),
    prisma.refreshSession.create({data:{id:sessionId,adminId:user.id,tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+30*24*60*60*1000)}}),
  ]);
  res.cookie('konooz_refresh',token,cookie);
  console.info(JSON.stringify({event:'login_success',requestId:req.requestId,adminId:user.id,sessionId}));
  res.json({accessToken:access(user.id),admin:{username:user.username}});
});
router.post('/refresh',sameOrigin,async(req,res)=>{const token=req.cookies.konooz_refresh;if(!token){res.status(401).json({error:'Refresh token missing'});return;}try{const payload=jwt.verify(token,config.JWT_REFRESH_SECRET,jwtVerifyConfig);if(typeof payload==='string'||payload.tokenUse!=='refresh'||typeof payload.sub!=='string'||typeof payload.sid!=='string')throw new Error();const session=await prisma.refreshSession.findUnique({where:{id:payload.sid}});const now=new Date();if(!session||session.adminId!==payload.sub||session.expiresAt<=now||!equalHash(tokenHash(token),session.tokenHash))throw new Error();const nextToken=refresh(payload.sub,payload.sid),nextExpiry=new Date(Date.now()+30*24*60*60*1000);const rotated=await prisma.refreshSession.updateMany({where:{id:payload.sid,adminId:payload.sub,tokenHash:session.tokenHash,expiresAt:{gt:now}},data:{tokenHash:tokenHash(nextToken),expiresAt:nextExpiry}});if(rotated.count!==1)throw new Error();res.cookie('konooz_refresh',nextToken,cookie);res.json({accessToken:access(payload.sub)});}catch{res.clearCookie('konooz_refresh',clearCookie);res.status(401).json({error:'Refresh token invalid'});}});
router.post('/logout',sameOrigin,async(req,res)=>{const token=req.cookies.konooz_refresh;try{const payload=jwt.verify(token,config.JWT_REFRESH_SECRET,jwtVerifyConfig);if(typeof payload!=='string'&&payload.tokenUse==='refresh'&&typeof payload.sid==='string')await prisma.refreshSession.deleteMany({where:{id:payload.sid}});}catch{}res.clearCookie('konooz_refresh',clearCookie);console.info(JSON.stringify({event:'logout',requestId:req.requestId}));res.status(204).end();});
export default router;
