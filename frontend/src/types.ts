export type SyncStatus='pending'|'synced'|'conflict';
export interface Variant{id:string;itemId:string;color:string;stockQuantity:number;createdAt:string;updatedAt:string;syncStatus:SyncStatus;deletedAt?:string|null}
export interface Item{id:string;modelNumber:string;price:number;photoUrl?:string|null;size?:string|null;material?:string|null;variants:Variant[];createdAt:string;updatedAt:string;syncStatus:SyncStatus;deletedAt?:string|null}
export interface SaleLine{id:string;saleId:string;itemVariantId:string;quantity:number;unitPriceAtSale:number;createdAt:string;updatedAt:string;syncStatus:SyncStatus;itemVariant?:Variant&{item?:Item}}
export interface Sale{id:string;totalAmount:number;items:SaleLine[];createdAt:string;updatedAt:string;syncStatus:SyncStatus;deletedAt?:string|null}
export interface QueueMutation{id:string;tableName:'items'|'item_variants'|'sales'|'sale_items';recordId:string;operation:'insert'|'update'|'delete';payload:Record<string,unknown>;createdAt:string}
