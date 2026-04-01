import type { MetalType } from '@/constants/metals';

export type Position = {
  id: string;
  metal: MetalType;
  product: string;
  weightG: number;
  quantity: number;
  purchasePrice: number;
  purchaseDate: string;
  createdAt: string;
  note?: string;
  spotAtPurchase?: number;
  primeAtPurchase?: number;
  spotSource?: 'live' | 'backfill';
  productId?: string;
};
