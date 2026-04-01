import { OrTrackColors } from './theme';

export type MetalType = 'or' | 'argent' | 'platine' | 'palladium' | 'cuivre';

export const METAL_CONFIG: Record<MetalType, {
  symbol: string;
  name: string;
  chipBg: string;
  chipBorder: string;
  chipText: string;
  spotKey: 'gold' | 'silver' | 'platinum' | 'palladium' | 'copper';
}> = {
  or:        { symbol: 'XAU', name: 'Or',        chipBg: '#1F1B0A', chipBorder: OrTrackColors.gold, chipText: OrTrackColors.gold, spotKey: 'gold' },
  argent:    { symbol: 'XAG', name: 'Argent',    chipBg: '#18181F', chipBorder: '#A8A8B8', chipText: '#A8A8B8', spotKey: 'silver' },
  platine:   { symbol: 'XPT', name: 'Platine',   chipBg: '#1C1C1C', chipBorder: '#E0E0E0', chipText: '#E0E0E0', spotKey: 'platinum' },
  palladium: { symbol: 'XPD', name: 'Palladium', chipBg: '#1F1B0A', chipBorder: '#CBA135', chipText: '#CBA135', spotKey: 'palladium' },
  cuivre:    { symbol: 'XCU', name: 'Cuivre',    chipBg: '#1E1510', chipBorder: '#B87333', chipText: '#B87333', spotKey: 'copper' },
};

export const OZ_TO_G = 31.10435;

export function getSpot(
  metal: MetalType,
  prices: { gold: number | null; silver: number | null; platinum: number | null; palladium: number | null; copper: number | null }
): number | null {
  return prices[METAL_CONFIG[metal].spotKey];
}
