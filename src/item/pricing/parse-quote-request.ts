import { parseDecimalString, type Decimal } from './decimal-money.js';
import { emptyComputation } from './pricing-result.js';
import type {
  FeeDraft,
  PricingComputation,
  ProcurementLineDraft,
  PurchaseMappingDraft,
  ShippingParcelDraft,
  SkuPricingDraft,
} from './sku-pricing.types.js';

export type ParseResult =
  | { ok: true; draft: SkuPricingDraft }
  | { ok: false; error: PricingComputation };

const REQUIRED_DECIMAL_FIELDS = [
  'sales_quantity',
  'goods_total',
  'supplier_shipping',
  'other_purchase_cost',
  'selling_fixed_cost',
  'after_sale_reserve',
  'merchant_fixed_coupon',
] as const;

const OPTIONAL_DECIMAL_FIELDS = ['target_contribution', 'target_margin', 'candidate_list_price'] as const;

const REQUIRED_STRING_FIELDS = [
  'formula_version',
  'mode',
  'currency',
  'scenario_id',
  'procurement_validation',
  'input_evidence_status',
  'fee_rounding',
] as const;

/**
 * 只做形状和十进制字符串解析。
 * 缺项留在草稿里，由定价策略决定 needs_requote、invalid_procurement 或 needs_input 的优先级。
 * JSON 数字会拒绝，避免二进制浮点进入金额计算。
 */
export function parseQuoteRequest(raw: Record<string, unknown>): ParseResult {
  const invalid: string[] = [];
  const missing: string[] = [];

  const strings = readStrings(raw, invalid, missing);
  const decimals = readDecimals(raw, invalid, missing);
  const feeItems = readFeeItems(raw, invalid, missing);
  const evidenceRefs = readStringArray(raw, 'evidence_refs', invalid);
  const verifiedAt = readOptionalString(raw, 'verified_at', invalid);
  const scenarioMatchesRequest = readOptionalBoolean(raw, 'scenario_matches_request', invalid);
  const salesSkuId = readOptionalString(raw, 'sales_sku_id', invalid);
  const inputVersion = readOptionalString(raw, 'input_version', invalid);
  const goodsTotalAuthority = readOptionalString(raw, 'goods_total_authority', invalid);
  const purchaseMappings = readPurchaseMappings(raw, invalid, missing);
  const procurementLines = readProcurementLines(raw, invalid, missing);
  const shippingParcels = readShippingParcels(raw, invalid, missing);
  const shippingIncludedInGoods = readDefaultBoolean(raw, 'shipping_included_in_goods', invalid);
  const packagingIncludedInGoods = readDefaultBoolean(raw, 'packaging_included_in_goods', invalid);

  if (invalid.length > 0) {
    return {
      ok: false,
      error: emptyComputation({
        calculation_status: 'invalid_input',
        scenario_id: strings.scenario_id,
        missing_fields: [],
        evidence_refs: evidenceRefs ?? [],
        notes: invalid,
        input_version: inputVersion,
      }),
    };
  }

  const draft: SkuPricingDraft = {
    formulaVersion: strings.formula_version,
    mode: strings.mode,
    currency: strings.currency,
    scenarioId: strings.scenario_id,
    salesQuantity: decimals.sales_quantity,
    procurementValidation: strings.procurement_validation,
    goodsTotal: decimals.goods_total,
    supplierShipping: decimals.supplier_shipping,
    otherPurchaseCost: decimals.other_purchase_cost,
    sellingFixedCost: decimals.selling_fixed_cost,
    afterSaleReserve: decimals.after_sale_reserve,
    feeItems,
    merchantFixedCoupon: decimals.merchant_fixed_coupon,
    targetContribution: decimals.target_contribution,
    targetMargin: decimals.target_margin,
    inputEvidenceStatus: strings.input_evidence_status,
    feeRounding: strings.fee_rounding,
    candidateListPrice: decimals.candidate_list_price,
    evidenceRefs: evidenceRefs ?? [],
    verifiedAt,
    scenarioMatchesRequest,
    salesSkuId,
    purchaseMappings,
    procurementLines,
    goodsTotalAuthority,
    shippingParcels,
    shippingIncludedInGoods,
    packagingIncludedInGoods,
    inputVersion,
    platformSubsidyPresent: presentValue(raw, 'platform_subsidy'),
    platformCouponPresent: presentValue(raw, 'platform_coupon'),
    unincludedSubsidyPresent: presentValue(raw, 'unincluded_subsidy'),
    multiItemDiscountPresent: presentValue(raw, 'multi_item_discount'),
    missingFields: missing,
  };

  return { ok: true, draft };
}

function readStrings(
  raw: Record<string, unknown>,
  invalid: string[],
  missing: string[],
): Record<(typeof REQUIRED_STRING_FIELDS)[number], string | null> {
  const result = {
    formula_version: null,
    mode: null,
    currency: null,
    scenario_id: null,
    procurement_validation: null,
    input_evidence_status: null,
    fee_rounding: null,
  } as Record<(typeof REQUIRED_STRING_FIELDS)[number], string | null>;

  for (const key of REQUIRED_STRING_FIELDS) {
    if (!(key in raw) || raw[key] === null) {
      missing.push(key);
      continue;
    }
    if (typeof raw[key] !== 'string' || raw[key].trim() === '') {
      invalid.push(`${key} 必须是非空字符串`);
      continue;
    }
    result[key] = raw[key].trim();
  }
  return result;
}

function readDecimals(
  raw: Record<string, unknown>,
  invalid: string[],
  missing: string[],
): Record<(typeof REQUIRED_DECIMAL_FIELDS)[number] | (typeof OPTIONAL_DECIMAL_FIELDS)[number], Decimal | null> {
  const result: Record<string, Decimal | null> = {};
  for (const key of REQUIRED_DECIMAL_FIELDS) {
    result[key] = readDecimal(raw, key, true, invalid, missing);
  }
  for (const key of OPTIONAL_DECIMAL_FIELDS) {
    result[key] = readDecimal(raw, key, false, invalid, missing);
  }
  return result as Record<
    (typeof REQUIRED_DECIMAL_FIELDS)[number] | (typeof OPTIONAL_DECIMAL_FIELDS)[number],
    Decimal | null
  >;
}

function readDecimal(
  raw: Record<string, unknown>,
  key: string,
  required: boolean,
  invalid: string[],
  missing: string[],
): Decimal | null {
  if (!(key in raw) || raw[key] === null) {
    if (required) {
      missing.push(key);
    }
    return null;
  }
  const parsed = parseDecimalString(raw[key]);
  if (parsed === 'invalid' || parsed === null) {
    invalid.push(`${key} 必须是十进制字符串，不能使用 JSON 数字`);
    return null;
  }
  return parsed;
}

function readFeeItems(
  raw: Record<string, unknown>,
  invalid: string[],
  missing: string[],
): FeeDraft[] | null {
  if (!('fee_items' in raw) || raw.fee_items === null) {
    missing.push('fee_items');
    return null;
  }
  if (!Array.isArray(raw.fee_items)) {
    invalid.push('fee_items 必须是数组');
    return null;
  }
  const items: FeeDraft[] = [];
  raw.fee_items.forEach((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      invalid.push(`fee_items[${index}] 必须是对象`);
      return;
    }
    const record = item as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (name === '') {
      invalid.push(`fee_items[${index}].name 必须是非空字符串`);
    }
    const base = typeof record.base === 'string' ? record.base.trim() : '';
    if (base === '') {
      invalid.push(`fee_items[${index}].base 必须是非空字符串`);
    }
    const rate = readNestedDecimal(record, 'rate', invalid, missing, `fee_items[${index}].rate`);
    const minCharge = readOptionalNestedDecimal(record, 'min_charge', invalid, `fee_items[${index}].min_charge`);
    const maxCharge = readOptionalNestedDecimal(record, 'max_charge', invalid, `fee_items[${index}].max_charge`);
    const threshold = readOptionalNestedDecimal(record, 'threshold', invalid, `fee_items[${index}].threshold`);
    const subsidy = readOptionalNestedDecimal(record, 'subsidy', invalid, `fee_items[${index}].subsidy`);
    const tiersPresent = 'tiers' in record && record.tiers !== null && !(Array.isArray(record.tiers) && record.tiers.length === 0);
    items.push({
      name,
      base,
      rate,
      minCharge,
      maxCharge,
      tiersPresent,
      threshold,
      subsidy,
    });
    });
  return items;
}

function readPurchaseMappings(
  raw: Record<string, unknown>,
  invalid: string[],
  missing: string[],
): PurchaseMappingDraft[] | null {
  if (!('purchase_mappings' in raw) || raw.purchase_mappings === null) {
    return null;
  }
  if (!Array.isArray(raw.purchase_mappings)) {
    invalid.push('purchase_mappings 必须是数组');
    return null;
  }
  const mappings: PurchaseMappingDraft[] = [];
  raw.purchase_mappings.forEach((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      invalid.push(`purchase_mappings[${index}] 必须是对象`);
      return;
    }
    const record = item as Record<string, unknown>;
    const purchaseSkuId = typeof record.purchase_sku_id === 'string' ? record.purchase_sku_id.trim() : '';
    if (purchaseSkuId === '') {
      invalid.push(`purchase_mappings[${index}].purchase_sku_id 必须是非空字符串`);
    }
    const unitsPerSale = readNestedDecimal(
      record,
      'units_per_sale',
      invalid,
      missing,
      `purchase_mappings[${index}].units_per_sale`,
    );
    const unitsPerPurchase = readNestedDecimal(
      record,
      'units_per_purchase',
      invalid,
      missing,
      `purchase_mappings[${index}].units_per_purchase`,
    );
    if (unitsPerSale && unitsPerPurchase) {
      mappings.push({ purchaseSkuId, unitsPerSale, unitsPerPurchase });
    }
  });
  return mappings;
}

function readProcurementLines(
  raw: Record<string, unknown>,
  invalid: string[],
  missing: string[],
): ProcurementLineDraft[] | null {
  if (!('procurement_lines' in raw) || raw.procurement_lines === null) {
    return null;
  }
  if (!Array.isArray(raw.procurement_lines)) {
    invalid.push('procurement_lines 必须是数组');
    return null;
  }
  const lines: ProcurementLineDraft[] = [];
  raw.procurement_lines.forEach((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      invalid.push(`procurement_lines[${index}] 必须是对象`);
      return;
    }
    const record = item as Record<string, unknown>;
    const lineId = typeof record.line_id === 'string' ? record.line_id.trim() : '';
    if (lineId === '') {
      invalid.push(`procurement_lines[${index}].line_id 必须是非空字符串`);
    }
    const unitsPerSale = readNestedDecimal(
      record,
      'units_per_sale',
      invalid,
      missing,
      `procurement_lines[${index}].units_per_sale`,
    );
    const unitsPerPurchase = readNestedDecimal(
      record,
      'units_per_purchase',
      invalid,
      missing,
      `procurement_lines[${index}].units_per_purchase`,
    );
    const unitPrice = readNestedDecimal(record, 'unit_price', invalid, missing, `procurement_lines[${index}].unit_price`);
    const moq = readOptionalNestedDecimal(record, 'moq', invalid, `procurement_lines[${index}].moq`);
    const step = readOptionalNestedDecimal(record, 'step', invalid, `procurement_lines[${index}].step`);
    const allowFractionalUnit = readDefaultBoolean(record, 'allow_fractional_unit', invalid);
    if (unitsPerSale && unitsPerPurchase && unitPrice) {
      lines.push({
        lineId: lineId || `line-${index}`,
        unitsPerSale,
        unitsPerPurchase,
        unitPrice,
        moq,
        step,
        allowFractionalUnit,
      });
    }
  });
  return lines;
}

function readShippingParcels(
  raw: Record<string, unknown>,
  invalid: string[],
  missing: string[],
): ShippingParcelDraft[] | null {
  if (!('shipping_parcels' in raw) || raw.shipping_parcels === null) {
    return null;
  }
  if (!Array.isArray(raw.shipping_parcels)) {
    invalid.push('shipping_parcels 必须是数组');
    return null;
  }
  const parcels: ShippingParcelDraft[] = [];
  raw.shipping_parcels.forEach((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      invalid.push(`shipping_parcels[${index}] 必须是对象`);
      return;
    }
    const record = item as Record<string, unknown>;
    const parcelId = typeof record.parcel_id === 'string' ? record.parcel_id.trim() : '';
    const addressId = typeof record.address_id === 'string' ? record.address_id.trim() : '';
    if (parcelId === '') {
      invalid.push(`shipping_parcels[${index}].parcel_id 必须是非空字符串`);
    }
    if (addressId === '') {
      invalid.push(`shipping_parcels[${index}].address_id 必须是非空字符串`);
    }
    const fee = readNestedDecimal(record, 'fee', invalid, missing, `shipping_parcels[${index}].fee`);
    if (fee) {
      parcels.push({ parcelId, addressId, fee });
    }
  });
  return parcels;
}

function readNestedDecimal(
  record: Record<string, unknown>,
  key: string,
  invalid: string[],
  missing: string[],
  label: string,
): Decimal | null {
  if (!(key in record) || record[key] === null) {
    missing.push(label);
    return null;
  }
  const parsed = parseDecimalString(record[key]);
  if (parsed === 'invalid' || parsed === null) {
    invalid.push(`${label} 必须是十进制字符串，不能使用 JSON 数字`);
    return null;
  }
  return parsed;
}

function readOptionalNestedDecimal(
  record: Record<string, unknown>,
  key: string,
  invalid: string[],
  label: string,
): Decimal | null {
  if (!(key in record) || record[key] === null) {
    return null;
  }
  const parsed = parseDecimalString(record[key]);
  if (parsed === 'invalid' || parsed === null) {
    invalid.push(`${label} 必须是十进制字符串，不能使用 JSON 数字`);
    return null;
  }
  return parsed;
}

function readStringArray(
  raw: Record<string, unknown>,
  key: string,
  invalid: string[],
): string[] | null {
  if (!(key in raw) || raw[key] === null) {
    return null;
  }
  if (!Array.isArray(raw[key]) || raw[key].some((item) => typeof item !== 'string' || item.trim() === '')) {
    invalid.push(`${key} 必须是非空字符串数组`);
    return null;
  }
  return raw[key].map((item) => item.trim());
}

function readOptionalString(raw: Record<string, unknown>, key: string, invalid: string[]): string | null {
  if (!(key in raw) || raw[key] === null) {
    return null;
  }
  if (typeof raw[key] !== 'string' || raw[key].trim() === '') {
    invalid.push(`${key} 必须是非空字符串`);
    return null;
  }
  return raw[key].trim();
}

function readOptionalBoolean(raw: Record<string, unknown>, key: string, invalid: string[]): boolean | null {
  if (!(key in raw) || raw[key] === undefined) {
    return null;
  }
  if (raw[key] === null || typeof raw[key] !== 'boolean') {
    invalid.push(`${key} 必须是布尔值`);
    return null;
  }
  return raw[key];
}

function readDefaultBoolean(raw: Record<string, unknown>, key: string, invalid: string[]): boolean {
  if (!(key in raw) || raw[key] === undefined) {
    return false;
  }
  if (typeof raw[key] !== 'boolean') {
    invalid.push(`${key} 必须是布尔值`);
    return false;
  }
  return raw[key];
}

function presentValue(raw: Record<string, unknown>, key: string): boolean {
  return key in raw && raw[key] !== null && raw[key] !== undefined;
}
