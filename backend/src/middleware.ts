import type { ErrorRequestHandler,RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError, type ZodSchema } from 'zod';
import { config } from './config.js';
export const auth:RequestHandler=(req,res,next)=>{const token=req.headers.authorization?.replace(/^Bearer /,'');if(!token){res.status(401).json({error:'Authentication required'});return;}try{const payload=jwt.verify(token,config.JWT_ACCESS_SECRET) as {sub:string};req.adminId=payload.sub;next();}catch{res.status(401).json({error:'Access token expired or invalid'});}};
export const validate=(schema:ZodSchema):RequestHandler=>(req,res,next)=>{try{req.body=schema.parse(req.body);next();}catch(error){next(error);}};
export const notFound:RequestHandler=(_req,res)=>{res.status(404).json({error:'Route not found'});};
export const errorHandler:ErrorRequestHandler=(error,_req,res,_next)=>{if(error instanceof ZodError){res.status(422).json({error:'Validation failed',details:error.flatten()});return;}const known=error as {code?:string;message?:string;status?:number};if(known.status&&known.status>=400&&known.status<600){res.status(known.status).json({error:known.message??'Request failed'});return;}if(known.code==='P2002'){res.status(409).json({error:'A record with that unique value already exists'});return;}console.error(error);res.status(500).json({error:config.NODE_ENV==='production'?'Unexpected server error':known.message});};
