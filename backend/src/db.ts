import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {AsyncLocalStorage} from 'node:async_hooks';
import type {RequestHandler} from 'express';
import { config } from './config.js';

const createClient=()=>new PrismaClient({adapter:new PrismaPg({
  connectionString:config.DATABASE_URL,
  max:1,
  idleTimeoutMillis:1_000,
  allowExitOnIdle:true,
})});
const requestClient=new AsyncLocalStorage<PrismaClient>();
const fallbackClient=createClient();

export const prisma=new Proxy({} as PrismaClient,{
  get(_target,property){
    const client=requestClient.getStore()??fallbackClient;
    const value=Reflect.get(client,property,client);
    return typeof value==='function'?value.bind(client):value;
  },
});

export const prismaContext:RequestHandler=(_req,_res,next)=>{
  requestClient.run(createClient(),next);
};
