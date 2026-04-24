import type { MetalType } from './metals';

export type ProductCategory = 'piece' | 'lingot' | 'autre';

export type Product = {
  label: string;
  weightG: number | null;
  popular?: boolean;
  category: ProductCategory;
};

export const PRODUCTS: Record<MetalType, Product[]> = {
  or: [
    { label: 'Napoléon 20F', weightG: 5.81, category: 'piece' },
    { label: 'Krugerrand 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Souverain', weightG: 7.32, category: 'piece' },
    { label: 'Maple Leaf 1oz', weightG: 31.10, category: 'piece' },
    { label: '20F Suisse Vreneli', weightG: 5.81, category: 'piece' },
    { label: 'American Gold Eagle 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Philharmonique 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Britannia 1oz', weightG: 31.10, category: 'piece' },
    { label: '50 Pesos mexicain', weightG: 37.50, category: 'piece' },
    { label: 'Kangourou 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Buffalo Américain 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Panda de Chine 30g', weightG: 30, category: 'piece' },
    { label: 'Lingot 10g', weightG: 10, category: 'lingot' },
    { label: 'Lingot 100g', weightG: 100, category: 'lingot' },
    { label: 'Lingot 1kg', weightG: 1000, category: 'lingot' },
    { label: 'Autre', weightG: null, category: 'autre' },
  ],
  argent: [
    { label: 'Maple Leaf 1oz', weightG: 31.10, popular: true, category: 'piece' },
    { label: 'Philharmonique 1oz', weightG: 31.10, category: 'piece' },
    { label: 'American Eagle 1oz', weightG: 31.10, popular: true, category: 'piece' },
    { label: 'Britannia 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Panda 30g', weightG: 30, category: 'piece' },
    { label: 'Kangourou 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Krugerrand 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Lingot 100g', weightG: 100, category: 'lingot' },
    { label: 'Lingot 1kg', weightG: 1000, category: 'lingot' },
    { label: 'Autre', weightG: null, category: 'autre' },
  ],
  platine: [
    { label: 'Maple Leaf 1oz', weightG: 31.10, popular: true, category: 'piece' },
    { label: 'American Eagle 1oz', weightG: 31.10, popular: true, category: 'piece' },
    { label: 'Britannia 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Philharmonique 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Kangourou 1oz', weightG: 31.10, category: 'piece' },
    // Entrée générique conservée pour rétrocompatibilité des positions legacy stockées avec label='Pièce 1oz'
    { label: 'Pièce 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Lingot 100g', weightG: 100, category: 'lingot' },
    { label: 'Autre', weightG: null, category: 'autre' },
  ],
  palladium: [
    { label: 'Maple Leaf 1oz', weightG: 31.10, popular: true, category: 'piece' },
    { label: 'American Eagle 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Cook Islands 1oz', weightG: 31.10, category: 'piece' },
    // Entrée générique conservée pour rétrocompatibilité des positions legacy stockées avec label='Pièce 1oz'
    { label: 'Pièce 1oz', weightG: 31.10, category: 'piece' },
    { label: 'Autre', weightG: null, category: 'autre' },
  ],
};
