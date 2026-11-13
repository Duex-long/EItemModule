import type { PricingComputation, PricingDetail } from './sku-pricing.types';

export function emptyComputation(
  partial: Pick<PricingComputation, 'calculation_status' | 'scenario_id'> &
    Partial<Omit<PricingComputation, 'calculation_status' | 'scenario_id'>>,
): PricingComputation {
  return {
    calculation_status: partial.calculation_status,
    scenario_id: partial.scenario_id,
    purchase_cost: partial.purchase_cost ?? null,
    total_rate: partial.total_rate ?? null,
    minimum_merchant_income: partial.minimum_merchant_income ?? null,
    minimum_list_price: partial.minimum_list_price ?? null,
    candidate_list_price: partial.candidate_list_price ?? null,
    candidate_contribution_unrounded: partial.candidate_contribution_unrounded ?? null,
    target_met_in_this_scenario: partial.target_met_in_this_scenario ?? null,
    missing_fields: partial.missing_fields ?? [],
    evidence_refs: partial.evidence_refs ?? [],
    notes: partial.notes ?? [],
    input_version: partial.input_version ?? null,
    detail: partial.detail ?? null,
  };
}

export function blankDetail(): PricingDetail {
  return {
    sales_quantity: null,
    goods_total: null,
    supplier_shipping: null,
    other_purchase_cost: null,
    purchase_cost: null,
    selling_fixed_cost: null,
    after_sale_reserve: null,
    fixed_cost_k: null,
    total_rate: null,
    merchant_fixed_coupon: null,
    target_contribution: null,
    target_margin: null,
    raw_target_income: null,
    fee_rounding: null,
    price_adjustments_of_one_cent: 0,
    line_goods_total: null,
    goods_total_authority: null,
    forward_check: null,
    candidate_forward: null,
  };
}
