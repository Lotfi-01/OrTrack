import type { MetalType } from './metals';

export type SilverMvpProduct = {
  id: string;
  label: string;
  metal: MetalType;
  weightG: number;
  category: 'piece';
  popular: boolean;
  vatRate: number | null;
  premiumMinPct: number | null;
  premiumMaxPct: number | null;
};

export const SILVER_MVP_PRODUCTS: readonly SilverMvpProduct[] = [
  {
    id: 'silver-maple-leaf-1oz',
    label: 'Silver Maple Leaf 1 oz',
    metal: 'argent',
    weightG: 31.1035,
    category: 'piece',
    popular: true,
    vatRate: 0.20,
    premiumMinPct: 0,
    premiumMaxPct: 80,
  },
  {
    id: 'american-silver-eagle-1oz',
    label: 'American Silver Eagle 1 oz',
    metal: 'argent',
    weightG: 31.1035,
    category: 'piece',
    popular: true,
    vatRate: 0.20,
    premiumMinPct: 0,
    premiumMaxPct: 120,
  },
  {
    id: 'vienna-philharmonic-silver-1oz',
    label: 'Vienna Philharmonic 1 oz',
    metal: 'argent',
    weightG: 31.1035,
    category: 'piece',
    popular: true,
    vatRate: 0.20,
    premiumMinPct: 0,
    premiumMaxPct: 80,
  },
  {
    id: '50-francs-hercule-silver',
    label: '50 Francs Hercule',
    metal: 'argent',
    weightG: 27,
    category: 'piece',
    popular: true,
    vatRate: null,
    premiumMinPct: null,
    premiumMaxPct: null,
  },
  {
    id: '10-francs-hercule-silver',
    label: '10 Francs Hercule',
    metal: 'argent',
    weightG: 22.5,
    category: 'piece',
    popular: true,
    vatRate: null,
    premiumMinPct: null,
    premiumMaxPct: null,
  },
  {
    id: '5-francs-semeuse-silver',
    label: '5 Francs Semeuse',
    metal: 'argent',
    weightG: 10.02,
    category: 'piece',
    popular: true,
    vatRate: null,
    premiumMinPct: null,
    premiumMaxPct: null,
  },
] as const;

export const SILVER_MVP_PRODUCT_IDS = SILVER_MVP_PRODUCTS.map(product => product.id);

export function getSilverMvpProductById(productId?: string | null): SilverMvpProduct | null {
  if (!productId) return null;
  return SILVER_MVP_PRODUCTS.find(product => product.id === productId) ?? null;
}

export function isSilverMvpProductId(productId: unknown): productId is string {
  return typeof productId === 'string' && SILVER_MVP_PRODUCTS.some(product => product.id === productId);
}
