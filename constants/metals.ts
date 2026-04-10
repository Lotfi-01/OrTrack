import { OrTrackColors } from './theme';

export type MetalType = 'or' | 'argent' | 'platine' | 'palladium';

export type MetalSymbol = 'XAU' | 'XAG' | 'XPT' | 'XPD';

export const METAL_CONFIG: Record<MetalType, {
  symbol: MetalSymbol;
  name: string;
  chipBg: string;
  chipBorder: string;
  chipText: string;
  spotKey: 'gold' | 'silver' | 'platinum' | 'palladium';
}> = {
  or:        { symbol: 'XAU', name: 'Or',        chipBg: '#1F1B0A', chipBorder: '#D4B24C', chipText: OrTrackColors.gold, spotKey: 'gold' },
  argent:    { symbol: 'XAG', name: 'Argent',    chipBg: '#18181F', chipBorder: '#D9D9E6', chipText: '#A8A8B8', spotKey: 'silver' },
  platine:   { symbol: 'XPT', name: 'Platine',   chipBg: '#1C1C1C', chipBorder: '#F1F1F3', chipText: '#E0E0E0', spotKey: 'platinum' },
  palladium: { symbol: 'XPD', name: 'Palladium', chipBg: '#1F1B0A', chipBorder: '#8FA3B8', chipText: '#CBA135', spotKey: 'palladium' },
};

export const OZ_TO_G = 31.10435;

export function getSpot(
  metal: MetalType,
  prices: { gold: number | null; silver: number | null; platinum: number | null; palladium: number | null }
): number | null {
  return prices[METAL_CONFIG[metal].spotKey];
}
