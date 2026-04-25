import { useCallback, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import { normalizePurchasePriceInput } from '@/utils/add-position/price-input';

export type UsePriceFieldResult = {
  purchasePrice: string;
  setPurchasePrice: Dispatch<SetStateAction<string>>;
  priceDisplay: string;
  setPriceDisplay: Dispatch<SetStateAction<string>>;
  priceKey: number;
  setPriceKey: Dispatch<SetStateAction<number>>;
  priceLocalRef: MutableRefObject<string>;
  commitPurchasePriceInput: () => string;
};

export function usePriceField(
  formatPositiveValue: (value: number) => string,
): UsePriceFieldResult {
  const [purchasePrice, setPurchasePrice] = useState('');
  const [priceDisplay, setPriceDisplay] = useState('');
  const [priceKey, setPriceKey] = useState(0);
  const priceLocalRef = useRef<string>('');

  const commitPurchasePriceInput = useCallback((): string => {
    const result = normalizePurchasePriceInput(
      priceLocalRef.current,
      formatPositiveValue,
    );
    setPurchasePrice(prev => (prev === result.normalized ? prev : result.normalized));
    setPriceDisplay(result.displayValue);
    setPriceKey(k => k + 1);
    return result.normalized;
  }, [formatPositiveValue]);

  return {
    purchasePrice,
    setPurchasePrice,
    priceDisplay,
    setPriceDisplay,
    priceKey,
    setPriceKey,
    priceLocalRef,
    commitPurchasePriceInput,
  };
}
