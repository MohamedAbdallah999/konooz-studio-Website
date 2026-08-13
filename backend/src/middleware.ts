import type { ErrorRequestHandler,RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError, type ZodSchema } from 'zod';
import { config, jwtVerifyConfig } from './config.js';

export const requestContext:RequestHandler=(req,res,next)=>{
  const incoming=req.header('cf-ray')?.split('-')[0];
  req.requestId=incoming&&/^[a-f0-9]{16,32}$/i.test(incoming)?incoming:crypto.randomUUID();
  res.setHeader('X-Request-Id',req.requestId);
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  next();
};

export const auth:RequestHandler=(req,res,next)=>{
  const match=req.headers.authorization?.match(/^Bearer ([^\s]+)$/);
  if(!match){res.status(401).json({error:'Authentication required'});return;}
  try{
    const payload=jwt.verify(match[1]!,config.JWT_ACCESS_SECRET,jwtVerifyConfig);
    if(typeof payload==='string'||payload.tokenUse!=='access'||typeof payload.sub!=='string')throw new Error('Invalid access token');
    req.adminId=payload.sub;
    next();
  }catch{
    console.warn(JSON.stringify({event:'authorization_failure',requestId:req.requestId,path:req.path}));
    res.status(401).json({error:'Access token expired or invalid'});
  }
};

export const sameOrigin:RequestHandler=(req,res,next)=>{
  const origin=req.header('origin');
  if(origin&&origin!==config.FRONTEND_ORIGIN){
    console.warn(JSON.stringify({event:'csrf_origin_rejected',requestId:req.requestId,path:req.path}));
    res.status(403).json({error:'Request origin is not allowed'});
    return;
  }
  next();
};

export const validate=(schema:ZodSchema):RequestHandler=>(req,res,next)=>{try{req.body=schema.parse(req.body);next();}catch(error){next(error);}};
export const notFound:RequestHandler=(_req,res)=>{res.status(404).json({error:'Route not found'});};
export const errorHandler:ErrorRequestHandler=(error,req,res,_next)=>{if(error instanceof ZodError){res.status(422).json({error:'Validation failed',details:error.flatten()});return;}const known=error as {code?:string;message?:string;status?:number};if(known.status&&known.status>=400&&known.status<500){res.status(known.status).json({error:known.message??'Request failed'});return;}if(known.code==='P2002'){res.status(409).json({error:'A record with that unique value already exists'});return;}console.error(JSON.stringify({event:'request_error',requestId:req.requestId,path:req.path,errorType:error instanceof Error?error.name:'UnknownError',message:error instanceof Error?error.message:'Unknown error'}));const status=known.status&&known.status>=500&&known.status<600?known.status:500;res.status(status).json({error:config.NODE_ENV==='production'?(status===503?'Service unavailable':'Unexpected server error'):known.message??'Unexpected server error'});};
