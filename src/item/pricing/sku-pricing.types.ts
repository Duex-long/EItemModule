import type { Decimal } from './decimal-money.js';

export const CALCULATION_STATUSES = [
  'calculated',
  'estimated',
  'needs_input',
  'unsupported_rule',
  'invalid_procurement',
  'needs_requote',
  'invalid_input',
] as const;

export type CalculationStatus = (typeof CALCULATION_STATUSES)[number];

export const FEE_ROUNDINGS = ['unrounded_estimate', 'per_item_half_up', 'per_item_ceil'] as const;

export type FeeRounding = (typeof FEE_ROUNDINGS)[number];

export interface FeeDraft {
  name: string;
  base: string;
  rate: Decimal | null;
  minCharge: Decimal | null;
  maxCharge: Decimal | null;
  tiersPresent: boolean;
  threshold: Decimal | null;
  subsidy: Decimal | null;
}

export interface ProcurementLineDraft {
  lineId: string;
  unitsPerSale: Decimal;
  unitsPerPurchase: Decimal;
  unitPrice: Decimal;
  moq: Decimal | null;
  step: Decimal | null;
  allowFractionalUnit: boolean;
}

export interface ShippingParcelDraft {
  parcelId: string;
  addressId: string;
  fee: Decimal;
}

export interface PurchaseMappingDraft {
  purchaseSkuId: string;
  unitsPerSale: Decimal;
  unitsPerPurchase: Decimal;
}

/**
 * 解析后的测算草稿。金额在进入公式前保持 Decimal；
 * null 表示缺项，不能换成 0。
 */
export interface SkuPricingDraft {
  formulaVersion: string | null;
  mode: string | null;
  currency: string | null;
  scenarioId: string | null;
  salesQuantity: Decimal | null;
  procurementValidation: string | null;
  goodsTotal: Decimal | null;
  supplierShipping: Decimal | null;
  otherPurchaseCost: Decimal | null;
  sellingFixedCost: Decimal | null;
  afterSaleReserve: Decimal | null;
  feeItems: FeeDraft[] | null;
  merchantFixedCoupon: Decimal | null;
  targetContribution: Decimal | null;
  targetMargin: Decimal | null;
  inputEvidenceStatus: string | null;
  feeRounding: string | null;
  candidateListPrice: Decimal | null;
  evidenceRefs: string[];
  verifiedAt: string | null;
  scenarioMatchesRequest: boolean | null;
  salesSkuId: string | null;
  purchaseMappings: PurchaseMappingDraft[] | null;
  procurementLines: ProcurementLineDraft[] | null;
  goodsTotalAuthority: string | null;
  shippingParcels: ShippingParcelDraft[] | null;
  shippingIncludedInGoods: boolean;
  packagingIncludedInGoods: boolean;
  inputVersion: string | null;
  platformSubsidyPresent: boolean;
  platformCouponPresent: boolean;
  unincludedSubsidyPresent: boolean;
  multiItemDiscountPresent: boolean;
  missingFields: string[];
}

export interface ReadySkuPricingDraft extends SkuPricingDraft {
  formulaVersion: string;
  mode: string;
  currency: string;
  scenarioId: string;
  salesQuantity: Decimal;
  procurementValidation: string;
  goodsTotal: Decimal;
  supplierShipping: Decimal;
  otherPurchaseCost: Decimal;
  sellingFixedCost: Decimal;
  afterSaleReserve: Decimal;
  feeItems: FeeDraft[];
  merchantFixedCoupon: Decimal;
  inputEvidenceStatus: string;
  feeRounding: string;
}

export interface PricingDetail {
  sales_quantity: string | null;
  goods_total: string | null;
  supplier_shipping: string | null;
  other_purchase_cost: string | null;
  purchase_cost: string | null;
  selling_fixed_cost: string | null;
  after_sale_reserve: string | null;
  fixed_cost_k: string | null;
  total_rate: string | null;
  merchant_fixed_coupon: string | null;
  target_contribution: string | null;
  target_margin: string | null;
  raw_target_income: string | null;
  fee_rounding: string | null;
  price_adjustments_of_one_cent: number;
  line_goods_total: string | null;
  goods_total_authority: string | null;
  forward_check: {
    merchant_income: string;
    contribution: string;
    margin: string | null;
    target_met: boolean;
  } | null;
  candidate_forward: {
    merchant_income: string;
    contribution_unrounded: string;
    contribution_with_fee_rounding: string;
    margin: string | null;
    target_met: boolean | null;
  } | null;
}

export interface PricingComputation {
  calculation_status: CalculationStatus;
  scenario_id: string | null;
  purchase_cost: string | null;
  total_rate: string | null;
  minimum_merchant_income: string | null;
  minimum_list_price: string | null;
  candidate_list_price: string | null;
  candidate_contribution_unrounded: string | null;
  target_met_in_this_scenario: boolean | null;
  missing_fields: string[];
  evidence_refs: string[];
  notes: string[];
  input_version: string | null;
  detail: PricingDetail | null;
}

export interface SkuQuoteResponse extends PricingComputation {
  formula_version: typeof import('./decimal-money.js').FORMULA_VERSION;
  calculation_id: string;
  publish_authorized: false;
  reused: boolean;
  created_at: string;
}

export interface StoredQuote {
  calculationId: string;
  inputHash: string;
  createdAt: string;
  response: SkuQuoteResponse;
}
