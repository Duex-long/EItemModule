import Decimal from 'decimal.js';

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
});

export const FORMULA_VERSION = 'SKU-PRICING-R1' as const;
export const SUPPORTED_CURRENCY = 'CNY';
export const MERCHANT_GROSS_INCOME_BASE = 'merchant_gross_income';
export const SAME_BASE_FIXED_COUPON_MODE = 'same_base_fixed_coupon';

const DECIMAL_STRING = /^-?\d+(\.\d+)?$/;

export type ParsedDecimal = Decimal | 'invalid';

export function parseDecimalString(raw: unknown): ParsedDecimal | null {
  if (raw === null) {
    return null;
  }
  if (typeof raw !== 'string') {
    return 'invalid';
  }
  const trimmed = raw.trim();
  if (!DECIMAL_STRING.test(trimmed)) {
    return 'invalid';
  }
  return new Decimal(trimmed);
}

export function ceilToCent(value: Decimal): Decimal {
  return value.mul(100).ceil().div(100);
}

export function formatMoney(value: Decimal): string {
  return value.toFixed(2);
}

export function formatContribution(value: Decimal): string {
  return value.toFixed(4);
}

export function formatRate(value: Decimal): string {
  const normalized = value.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
  if (!normalized.includes('.')) {
    return `${normalized}.00`;
  }
  const [whole, fraction] = normalized.split('.');
  if (fraction.length < 2) {
    return `${whole}.${fraction.padEnd(2, '0')}`;
  }
  return `${whole}.${fraction}`;
}

export function isPositive(value: Decimal): boolean {
  return value.gt(0);
}

export function sameMoney(left: Decimal, right: Decimal): boolean {
  return left.eq(right);
}

export { Decimal };
