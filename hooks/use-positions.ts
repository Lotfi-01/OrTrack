import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/storage-keys';
import { Position } from '@/types/position';

let memoryCache: Position[] | null = null;

// Exposé pour wipeAllUserData() dans reglages.tsx.
// Remet le cache à null — le prochain usePositions rechargera les positions.
export function resetPositionsCache() {
  memoryCache = null;
}

export function usePositions() {
  const [positions, setPositions] = useState<Position[]>(memoryCache ?? []);
  const [loading, setLoading] = useState(memoryCache === null);

  const reloadPositions = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.positions);
      const parsed = raw ? JSON.parse(raw) : [];
      // Garde-fou : un JSON valide mais mal formé (objet au lieu de tableau) ne doit pas passer
      const safe: Position[] = Array.isArray(parsed) ? parsed : [];
      memoryCache = safe;
      setPositions(safe);
    } catch {
      // JSON corrompu ou AsyncStorage inaccessible → reset propre
      memoryCache = [];
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Optimistic update avec rollback si AsyncStorage échoue.
  const persist = useCallback(async (next: Position[]) => {
    const previous = memoryCache ?? [];
    memoryCache = next;
    setPositions(next);

    try {
      await AsyncStorage.setItem(STORAGE_KEYS.positions, JSON.stringify(next));
    } catch (error) {
      memoryCache = previous;
      setPositions(previous);
      throw error;
    }
  }, []);

  useEffect(() => {
    if (memoryCache === null) {
      reloadPositions();
    }
  }, [reloadPositions]);

  // IMPORTANT : les mutations lisent depuis memoryCache (synchrone)
  // et non depuis le state React (asynchrone).
  // Évite les race conditions si deux opérations sont appelées rapidement.

  return {
    positions,
    loading,
    reloadPositions,
    addPosition: async (position: Position) => {
      const current = memoryCache ?? [];
      return persist([position, ...current]);
    },
    updatePosition: async (position: Position) => {
      const current = memoryCache ?? [];
      return persist(current.map(p => (p.id === position.id ? position : p)));
    },
    deletePosition: async (id: string) => {
      const current = memoryCache ?? [];
      return persist(current.filter(p => p.id !== id));
    },
    replaceAllPositions: persist,
  };
}
