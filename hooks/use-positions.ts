import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/storage-keys';
import { Position } from '@/types/position';
import type { MetalType } from '@/constants/metals';

const SUPPORTED_METALS: Set<string> = new Set<MetalType>(['or', 'argent', 'platine', 'palladium']);

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Type guard strict pour les positions lues depuis AsyncStorage.
 * Filtre les entrées corrompues, incomplètes ou de métaux non supportés.
 * Les champs optionnels (note, spotAtPurchase, primeAtPurchase, spotSource, productId)
 * ne sont PAS validés — leur absence ne provoque pas de NaN.
 */
export function isValidPosition(p: unknown): p is Position {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.id === 'string' && o.id.length > 0 &&
    typeof o.metal === 'string' && SUPPORTED_METALS.has(o.metal) &&
    typeof o.product === 'string' &&
    typeof o.weightG === 'number' && o.weightG > 0 && isFinite(o.weightG) &&
    typeof o.quantity === 'number' && o.quantity > 0 && Number.isInteger(o.quantity) &&
    typeof o.purchasePrice === 'number' && o.purchasePrice >= 0 && isFinite(o.purchasePrice) &&
    typeof o.purchaseDate === 'string' && o.purchaseDate.length === 10 &&
    typeof o.createdAt === 'string'
  );
}

/** Parse et valide les positions depuis une chaîne AsyncStorage brute. */
function parsePositions(raw: string | null): Position[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('[use-positions] JSON invalide dans AsyncStorage — reset à vide');
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const valid = parsed.filter(isValidPosition);
  const filtered = parsed.length - valid.length;
  if (filtered > 0) {
    const ids = parsed
      .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null && typeof (p as any).id === 'string')
      .filter(p => !isValidPosition(p))
      .map(p => (p as any).id as string);
    console.warn(`[use-positions] ${filtered} position(s) filtrée(s)${ids.length > 0 ? ` (ids: ${ids.join(', ')})` : ''}`);
  }
  return valid;
}

// ── Cache, queue et compteurs ─────────────────────────────────────────────────

let memoryCache: Position[] | null = null;
let writePromise: Promise<void> = Promise.resolve();

// Invalide les opérations lancées avant un reset.
let generation = 0;
// Représente la dernière version cohérente de l'état positions en mémoire.
// Incrémenté par chaque mutation réussie et par resetPositionsCache.
let stateVersion = 0;

/**
 * Attend la fin de toutes les mutations positions déjà planifiées dans la queue.
 * À appeler AVANT un wipe AsyncStorage pour empêcher un setItem stale de réécrire
 * des positions anciennes après le multiRemove.
 * Ne déclenche aucune mutation, ne modifie ni memoryCache ni les compteurs.
 * Best-effort : si la dernière mutation a échoué, l'erreur est avalée silencieusement
 * pour ne pas bloquer le flow wipe.
 */
export async function awaitPendingPositionWrites(): Promise<void> {
  try { await writePromise; } catch { /* drain best-effort */ }
}

// Exposé pour wipeAllUserData() dans reglages.tsx.
// Remet le cache à null — le prochain usePositions rechargera les positions.
export function resetPositionsCache() {
  generation++;
  stateVersion++;
  memoryCache = null;
  writePromise = Promise.resolve();
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePositions() {
  const [positions, setPositions] = useState<Position[]>(memoryCache ?? []);
  const [loading, setLoading] = useState(memoryCache === null);

  const reloadPositions = useCallback(async () => {
    const capturedVersion = stateVersion;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.positions);
      const safe = parsePositions(raw);
      // Si une mutation ou un reset a produit un état plus récent pendant la
      // lecture, ce snapshot est stale — on l'ignore pour ne pas écraser.
      if (capturedVersion === stateVersion) {
        memoryCache = safe;
        setPositions(safe);
      }
    } catch {
      if (capturedVersion === stateVersion) {
        memoryCache = [];
        setPositions([]);
      }
    } finally {
      // Toujours libérer le loading, même si le snapshot est stale
      // (les données sont disponibles depuis la mutation qui a incrémenté stateVersion).
      setLoading(false);
    }
  }, []);

  // Mutation transactionnelle avec guards anti-stale.
  // - generation : invalide les mutations planifiées avant un reset.
  // - stateVersion : incrémenté à chaque mutation réussie pour invalider les lectures stale.
  // Le read-modify-write se produit entièrement à l'intérieur de la queue sérialisée.
  const persistTransform = useCallback(async (transform: (current: Position[]) => Position[]) => {
    const capturedGen = generation;
    let mutationError: unknown = null;

    writePromise = writePromise.then(async () => {
      try {
        // Guard 1 : abandon si un reset a eu lieu depuis la planification
        if (capturedGen !== generation) return;

        const raw = await AsyncStorage.getItem(STORAGE_KEYS.positions);
        const current = parsePositions(raw);
        const next = transform(current);

        // Guard 2 : abandon avant écriture storage si un reset est survenu pendant la lecture
        if (capturedGen !== generation) return;

        await AsyncStorage.setItem(STORAGE_KEYS.positions, JSON.stringify(next));

        // Guard 3 : abandon avant mise à jour mémoire si un reset est survenu pendant l'écriture
        if (capturedGen !== generation) return;

        memoryCache = next;
        setPositions(next);
        stateVersion++;
      } catch (error) {
        mutationError = error;
        // Ne pas throw ici — la queue reste vivante pour les opérations suivantes
      }
    });

    await writePromise;

    if (mutationError) throw mutationError;
  }, []);

  useEffect(() => {
    if (memoryCache === null) {
      reloadPositions();
    }
  }, [reloadPositions]);

  return {
    positions,
    loading,
    reloadPositions,
    addPosition: async (position: Position) => {
      return persistTransform((current) => [position, ...current]);
    },
    updatePosition: async (position: Position) => {
      return persistTransform((current) => current.map(p => (p.id === position.id ? position : p)));
    },
    deletePosition: async (id: string) => {
      return persistTransform((current) => current.filter(p => p.id !== id));
    },
    replaceAllPositions: async (next: Position[]) => {
      return persistTransform(() => next);
    },
  };
}
