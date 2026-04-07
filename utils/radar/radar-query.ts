import { supabase } from '@/lib/supabase';

/** Shape réelle de la table prime_daily dans Supabase */
interface SupabasePrimeRow {
  product_slug: string;
  date: string;
  prime_pct: number;
}

/** Shape interne utilisée par le reste du code Radar */
interface PrimeRow {
  product_id: string;
  metal: string;
  price_date: string;
  prime_pct: number;
}

function mapRow(row: SupabasePrimeRow): PrimeRow {
  return {
    product_id: row.product_slug,
    metal: '',  // prime_daily n'a pas de colonne metal — le métal est dérivé de RADAR_PRODUCT_METALS
    price_date: row.date,
    prime_pct: row.prime_pct,
  };
}

export type { PrimeRow };

/**
 * Récupère les primes courantes (dernière date disponible).
 * Ancré sur MAX(date), JAMAIS sur CURRENT_DATE.
 * Pas de filtre metal — la colonne n'existe pas dans prime_daily.
 */
export async function fetchCurrentPrimes(): Promise<{ rows: PrimeRow[]; latestDate: string | null }> {
  if (!supabase) throw new Error('Supabase client not initialized');

  const { data: latestData, error: latestError } = await supabase
    .from('prime_daily')
    .select('date')
    .order('date', { ascending: false })
    .limit(1);

  if (latestError) throw new Error(`Supabase fetchCurrentPrimes latestDate: ${latestError.message}`);
  if (!latestData?.length) return { rows: [], latestDate: null };

  const latestDate = (latestData[0] as { date: string }).date;

  const { data, error } = await supabase
    .from('prime_daily')
    .select('product_slug, date, prime_pct')
    .eq('date', latestDate)
    .order('product_slug');

  if (error) throw new Error(`Supabase fetchCurrentPrimes: ${error.message}`);

  return { rows: ((data ?? []) as SupabasePrimeRow[]).map(mapRow), latestDate };
}

/**
 * Récupère l'historique des primes.
 * Fenêtre ancrée sur latestDate (PAS sur CURRENT_DATE).
 * Pas de filtre metal.
 */
export async function fetchPrimeHistory(
  latestDate: string,
  days: number,
): Promise<PrimeRow[]> {
  if (!supabase) throw new Error('Supabase client not initialized');

  const startDate = subtractDays(latestDate, days);

  const { data, error } = await supabase
    .from('prime_daily')
    .select('product_slug, date, prime_pct')
    .gte('date', startDate)
    .lte('date', latestDate)
    .order('product_slug')
    .order('date', { ascending: true });

  if (error) throw new Error(`Supabase fetchPrimeHistory: ${error.message}`);

  return ((data ?? []) as SupabasePrimeRow[]).map(mapRow);
}

function subtractDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
