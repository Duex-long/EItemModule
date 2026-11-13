import { createHash } from 'crypto';
import { parseDecimalString } from './decimal-money.js';

const DECIMAL_KEYS = new Set([
  'sales_quantity',
  'goods_total',
  'supplier_shipping',
  'other_purchase_cost',
  'selling_fixed_cost',
  'after_sale_reserve',
  'merchant_fixed_coupon',
  'target_contribution',
  'target_margin',
  'candidate_list_price',
  'rate',
  'min_charge',
  'max_charge',
  'threshold',
  'subsidy',
  'platform_subsidy',
  'platform_coupon',
  'unincluded_subsidy',
  'multi_item_discount',
  'units_per_sale',
  'units_per_purchase',
  'unit_price',
  'moq',
  'step',
  'fee',
]);

export function canonicalRequestHash(raw: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(normalize(raw))).digest('hex');
}

function normalize(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const child of Object.keys(source).sort()) {
      sorted[child] = normalize(source[child], child);
    }
    return sorted;
  }
  if (typeof value === 'string' && key && DECIMAL_KEYS.has(key)) {
    const parsed = parseDecimalString(value);
    if (parsed !== null && parsed !== 'invalid') {
      return parsed.toString();
    }
  }
  return value;
}
