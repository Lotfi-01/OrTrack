import { act, renderHook } from '@testing-library/react-native';

import { usePriceField } from '../usePriceField';

const format = (value: number) => `F(${value})`;

describe('usePriceField', () => {
  it('starts with empty purchasePrice, empty priceDisplay, priceKey 0, and empty priceLocalRef', () => {
    const { result } = renderHook(() => usePriceField(format));

    expect(result.current.purchasePrice).toBe('');
    expect(result.current.priceDisplay).toBe('');
    expect(result.current.priceKey).toBe(0);
    expect(result.current.priceLocalRef.current).toBe('');
  });

  it('commit normalizes a comma input and returns the normalized string', () => {
    const { result } = renderHook(() => usePriceField(format));

    let returned = '';
    act(() => {
      result.current.priceLocalRef.current = '1234,56';
      returned = result.current.commitPurchasePriceInput();
    });

    expect(returned).toBe('1234.56');
  });

  it('commit updates purchasePrice to the normalized string', () => {
    const { result } = renderHook(() => usePriceField(format));

    act(() => {
      result.current.priceLocalRef.current = '1234,56';
      result.current.commitPurchasePriceInput();
    });

    expect(result.current.purchasePrice).toBe('1234.56');
  });

  it('commit updates priceDisplay using the parent-supplied formatter for a positive value', () => {
    const { result } = renderHook(() => usePriceField(format));

    act(() => {
      result.current.priceLocalRef.current = '1234,56';
      result.current.commitPurchasePriceInput();
    });

    expect(result.current.priceDisplay).toBe('F(1234.56)');
  });

  it('commit increments priceKey by 1', () => {
    const { result } = renderHook(() => usePriceField(format));

    expect(result.current.priceKey).toBe(0);

    act(() => {
      result.current.priceLocalRef.current = '12';
      result.current.commitPurchasePriceInput();
    });

    expect(result.current.priceKey).toBe(1);
  });

  it('a second commit increments priceKey again', () => {
    const { result } = renderHook(() => usePriceField(format));

    act(() => {
      result.current.priceLocalRef.current = '12';
      result.current.commitPurchasePriceInput();
    });
    act(() => {
      result.current.priceLocalRef.current = '34';
      result.current.commitPurchasePriceInput();
    });

    expect(result.current.priceKey).toBe(2);
    expect(result.current.purchasePrice).toBe('34');
  });

  it('empty input commits empty purchasePrice and empty priceDisplay but still increments priceKey', () => {
    const { result } = renderHook(() => usePriceField(format));

    let returned = 'unchanged';
    act(() => {
      result.current.priceLocalRef.current = '';
      returned = result.current.commitPurchasePriceInput();
    });

    expect(returned).toBe('');
    expect(result.current.purchasePrice).toBe('');
    expect(result.current.priceDisplay).toBe('');
    expect(result.current.priceKey).toBe(1);
  });

  it('exposes setPurchasePrice for reset-style updates', () => {
    const { result } = renderHook(() => usePriceField(format));

    act(() => {
      result.current.setPurchasePrice('seed');
    });
    expect(result.current.purchasePrice).toBe('seed');

    act(() => {
      result.current.setPurchasePrice('');
    });
    expect(result.current.purchasePrice).toBe('');
  });

  it('exposes setPriceDisplay for reset-style updates', () => {
    const { result } = renderHook(() => usePriceField(format));

    act(() => {
      result.current.setPriceDisplay('1 234,56');
    });
    expect(result.current.priceDisplay).toBe('1 234,56');

    act(() => {
      result.current.setPriceDisplay('');
    });
    expect(result.current.priceDisplay).toBe('');
  });

  it('exposes setPriceKey for reset-style updates (functional updater bumps the key)', () => {
    const { result } = renderHook(() => usePriceField(format));

    act(() => {
      result.current.setPriceKey(k => k + 1);
    });
    expect(result.current.priceKey).toBe(1);

    act(() => {
      result.current.setPriceKey(k => k + 1);
    });
    expect(result.current.priceKey).toBe(2);
  });

  it('priceLocalRef.current can be reset to an empty string by the parent', () => {
    const { result } = renderHook(() => usePriceField(format));

    act(() => {
      result.current.priceLocalRef.current = '999';
    });
    expect(result.current.priceLocalRef.current).toBe('999');

    act(() => {
      result.current.priceLocalRef.current = '';
    });
    expect(result.current.priceLocalRef.current).toBe('');
  });
});
