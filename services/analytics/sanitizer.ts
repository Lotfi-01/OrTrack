import type { AnalyticsProperties } from './events';

const MAX_PROPERTY_COUNT = 20;
const MAX_STRING_LENGTH = 120;

// Forbidden sensitive words (exact key match or as token in compound keys).
// Word-boundary tokens such as `purchase_price` -> ['purchase', 'price'] are
// considered to "contain" the sensitive word `price`.
const SENSITIVE_WORDS = [
  'email',
  'name',
  'phone',
  'address',
  'price',
  'amount',
  'portfolio',
  'value',
] as const;

// Explicit safe-list — short, audited keys that intentionally embed a
// sensitive word but carry no PII. `has_purchase_price` is a boolean flag
// describing whether the user provided a purchase price, not the price itself.
const SAFE_KEYS = new Set<string>([
  'has_purchase_price',
  'has_purchase_date',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function tokenize(key: string): string[] {
  return key.toLowerCase().split(/[_\-.\s]+/g).filter(Boolean);
}

function keyContainsSensitiveWord(key: string): boolean {
  if (SAFE_KEYS.has(key)) return false;
  const tokens = tokenize(key);
  for (const word of SENSITIVE_WORDS) {
    if (tokens.includes(word)) return true;
  }
  return false;
}

function isAllowedScalar(
  value: unknown,
): value is string | number | boolean | null {
  if (value === null) return true;
  const t = typeof value;
  return t === 'string' || t === 'number' || t === 'boolean';
}

export function sanitizeAnalyticsProperties(
  properties?: AnalyticsProperties,
): AnalyticsProperties {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return {};
  }

  const out: AnalyticsProperties = {};
  let count = 0;

  for (const key of Object.keys(properties)) {
    if (count >= MAX_PROPERTY_COUNT) break;

    const value = properties[key];

    if (value === undefined) continue;
    if (Array.isArray(value)) continue;
    if (isPlainObject(value)) continue;
    if (!isAllowedScalar(value)) continue;
    if (keyContainsSensitiveWord(key)) continue;

    if (typeof value === 'number' && !Number.isFinite(value)) continue;

    let safeValue: string | number | boolean | null = value;
    if (typeof safeValue === 'string' && safeValue.length > MAX_STRING_LENGTH) {
      safeValue = safeValue.slice(0, MAX_STRING_LENGTH);
    }

    out[key] = safeValue;
    count += 1;
  }

  return out;
}
