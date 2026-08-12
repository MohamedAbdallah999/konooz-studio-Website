export type SyncStatus = 'pending' | 'synced' | 'conflict';
export type DecimalString = string;

export interface Pack {
  id: string;
  modelColourId: string;
  sizesPerPack: number;
  stockQuantity: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface ModelColour {
  id: string;
  modelId: string;
  name: string;
  isActive: boolean;
  packs: Pack[];
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface ProductModel {
  id: string;
  modelNumber: string;
  price: DecimalString;
  photoUrl?: string | null;
  material?: string | null;
  isActive: boolean;
  colours: ModelColour[];
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface LegacyVariantSnapshot {
  id: string;
  itemId: string;
  size: string;
  color: string;
  item?: { id: string; modelNumber: string; price: DecimalString };
}

export interface SaleLine {
  id: string;
  saleId: string;
  modelIdAtSale?: string | null;
  modelNumberAtSale?: string | null;
  modelPriceAtSale?: DecimalString | null;
  colourIdAtSale?: string | null;
  colourNameAtSale?: string | null;
  packId?: string | null;
  sizesPerPackAtSale?: number | null;
  packPriceAtSale?: DecimalString | null;
  numberOfPacks?: number | null;
  lineSubtotal?: DecimalString | null;
  discountAllocation?: DecimalString | null;
  finalLineTotal?: DecimalString | null;
  itemVariantId?: string | null;
  quantity?: number | null;
  unitPriceAtSale?: DecimalString | null;
  legacyModelIdAtSale?: string | null;
  legacyModelNumberAtSale?: string | null;
  legacyModelPriceAtSale?: DecimalString | null;
  legacyColourNameAtSale?: string | null;
  legacySizeAtSale?: string | null;
  itemVariant?: LegacyVariantSnapshot | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface Sale {
  id: string;
  totalAmount: DecimalString;
  depositAmount: DecimalString;
  paidAmount: DecimalString;
  paidAt?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  shopName?: string | null;
  customerAddress?: string | null;
  discountPercentage: DecimalString;
  items: SaleLine[];
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  deletedAt?: string | null;
}
