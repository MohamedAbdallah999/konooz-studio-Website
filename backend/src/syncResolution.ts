type Timed={updatedAt?:string|Date};
export function resolveLww(client:Timed,server:Timed|null){if(!server)return {winner:'client' as const,conflict:false};const c=new Date(client.updatedAt??0).getTime(),s=new Date(server.updatedAt??0).getTime();return {winner:c>=s?'client' as const:'server' as const,conflict:c!==s};}
export function resolveMutation(operation:'insert'|'update'|'delete',client:Timed,server:Timed|null){return operation==='delete'?{winner:'client' as const,conflict:Boolean(server)}:resolveLww(client,server)}
export const shouldRestoreRefundStock=(deletedAt:string|Date|null|undefined)=>!deletedAt;
