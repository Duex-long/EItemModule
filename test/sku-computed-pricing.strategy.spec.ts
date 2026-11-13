import { Test } from '@nestjs/testing';
import { Decimal } from '../src/item/pricing/decimal-money.js';
import { evaluateProcurementLine } from '../src/item/pricing/procurement-quantity.js';
import { BaseSkuPricingStrategy } from '../src/item/pricing/base-sku-pricing-strategy.js';
import { SkuComputedPricingStrategy } from '../src/item/pricing/sku-computed-pricing.strategy.js';
import { ItemModule } from '../src/item/item.module.js';
import { SkuPricingService } from '../src/item/pricing/sku-pricing.service.js';
import type { ProcurementLineDraft } from '../src/item/pricing/sku-pricing.types.js';
import { exampleRequest, withExample } from './quote-fixture.js';

async function quote(body: Record<string, unknown>) {
  const moduleRef = await Test.createTestingModule({
    imports: [ItemModule.register({ quoteStore: 'memory' })],
  }).compile();
  return moduleRef.get(SkuPricingService).quote(body);
}

describe('SkuComputedPricingStrategy', () => {
  it('does not override the base quote template', () => {
    expect(Object.hasOwn(SkuComputedPricingStrategy.prototype, 'quote')).toBe(false);
    expect(Object.hasOwn(BaseSkuPricingStrategy.prototype, 'quote')).toBe(true);
  });

  it('prices the specification example', async () => {
    const result = await quote(exampleRequest());

    expect(result).toMatchObject({
      formula_version: 'SKU-PRICING-R1',
      scenario_id: 'EXAMPLE-ONLY',
      calculation_status: 'estimated',
      purchase_cost: '8.00',
      total_rate: '0.05',
      minimum_merchant_income: '9.48',
      minimum_list_price: '9.48',
      candidate_list_price: '9.90',
      candidate_contribution_unrounded: '1.4050',
      target_met_in_this_scenario: true,
      publish_authorized: false,
      notes: ['仅为示例假设，未确认实际费用和售后损耗'],
    });
    expect(result.detail?.price_adjustments_of_one_cent).toBe(0);
    expect(result.detail?.sales_quantity).toBe('1');
  });

  it('prices the three specification scenarios and a fixed merchant coupon', async () => {
    const shipped = await quote(exampleRequest());
    const freeShipping = await quote(withExample({ supplier_shipping: '0.00', scenario_id: 'FREE-SHIPPING' }));
    const twoPack = await quote(
      withExample({ goods_total: '4.00', supplier_shipping: '3.00', sales_quantity: '2', scenario_id: 'TWO-PACK' }),
    );
    const coupon = await quote(withExample({ merchant_fixed_coupon: '1.00', scenario_id: 'COUPON' }));

    expect(shipped.minimum_list_price).toBe('9.48');
    expect(freeShipping.purchase_cost).toBe('5.00');
    expect(freeShipping.minimum_list_price).toBe('6.32');
    expect(twoPack.purchase_cost).toBe('7.00');
    expect(twoPack.minimum_list_price).toBe('8.43');
    expect(coupon.minimum_list_price).toBe('10.48');
    expect(coupon.minimum_merchant_income).toBe('9.48');
  });

  it('does not multiply an already scenario-level cost by sales quantity', async () => {
    const result = await quote(withExample({ sales_quantity: '99', scenario_id: 'QTY' }));
    expect(result.purchase_cost).toBe('8.00');
    expect(result.minimum_list_price).toBe('9.48');
  });

  it('keeps null shipping as a missing input', async () => {
    const result = await quote(withExample({ supplier_shipping: null, scenario_id: 'MISSING-SHIPPING' }));
    expect(result.calculation_status).toBe('needs_input');
    expect(result.missing_fields).toContain('supplier_shipping');
    expect(result.purchase_cost).toBeNull();
    expect(result.minimum_list_price).toBeNull();
  });

  it('treats a null contribution target as disabled and does not invent 1 yuan', async () => {
    const result = await quote(
      withExample({
        target_contribution: null,
        target_margin: null,
        scenario_id: 'NO-TARGET',
      }),
    );
    expect(result.calculation_status).toBe('estimated');
    expect(result.minimum_list_price).toBeNull();
    expect(result.minimum_merchant_income).toBeNull();
    expect(result.purchase_cost).toBe('8.00');
    expect(result.candidate_contribution_unrounded).toBe('1.4050');
    expect(result.target_met_in_this_scenario).toBeNull();
  });

  it('accepts an explicit zero contribution target as break-even', async () => {
    const result = await quote(withExample({ target_contribution: '0.00', scenario_id: 'BREAK-EVEN' }));
    expect(result.minimum_list_price).toBe('8.43');
    expect(result.detail?.forward_check?.target_met).toBe(true);
  });

  it('uses the stricter of contribution amount and contribution margin', async () => {
    const result = await quote(withExample({ target_margin: '0.20', scenario_id: 'MARGIN' }));
    expect(result.minimum_list_price).toBe('10.67');
    expect(result.detail?.forward_check?.target_met).toBe(true);
  });

  it('rejects a candidate that would miss the target instead of rounding the price down', async () => {
    const result = await quote(withExample({ candidate_list_price: '9.47', scenario_id: 'LOW-CANDIDATE' }));
    expect(result.minimum_list_price).toBe('9.48');
    expect(result.candidate_contribution_unrounded).toBe('0.9965');
    expect(result.target_met_in_this_scenario).toBe(false);
  });

  it('raises the list price by one cent when per-item ceiling misses the target', async () => {
    const result = await quote(
      withExample({
        goods_total: '5.00',
        supplier_shipping: '0.00',
        fee_items: [
          { name: 'fee_a', base: 'merchant_gross_income', rate: '0.01' },
          { name: 'fee_b', base: 'merchant_gross_income', rate: '0.01' },
        ],
        fee_rounding: 'per_item_ceil',
        target_contribution: '0.05',
        candidate_list_price: null,
        scenario_id: 'CEIL-BUMP',
      }),
    );
    expect(result.purchase_cost).toBe('5.00');
    expect(result.minimum_list_price).toBe('5.17');
    expect(result.detail?.price_adjustments_of_one_cent).toBe(1);
    expect(result.detail?.forward_check?.target_met).toBe(true);
  });

  it('marks verified unrounded fees as estimated and verified rounded fees as calculated', async () => {
    const proof = {
      procurement_validation: 'passed',
      input_evidence_status: 'verified',
      evidence_refs: ['evidence-1'],
      verified_at: '2026-11-13T12:00:00+08:00',
      sales_sku_id: 'SALES-1',
      purchase_mappings: [{ purchase_sku_id: 'PURCHASE-1', units_per_sale: '1', units_per_purchase: '1' }],
      input_version: 'cost-v1',
    };
    const estimated = await quote(withExample({ ...proof, scenario_id: 'VERIFIED-UNROUNDED' }));
    const calculated = await quote(
      withExample({ ...proof, fee_rounding: 'per_item_half_up', scenario_id: 'VERIFIED-ROUNDED' }),
    );
    expect(estimated.calculation_status).toBe('estimated');
    expect(estimated.notes).toContain('未核实逐项舍入规则，结果只能作为未取整估算');
    expect(estimated.minimum_list_price).toBe('9.48');
    expect(calculated.calculation_status).toBe('calculated');
    expect(calculated.input_version).toBe('cost-v1');
    expect(calculated.publish_authorized).toBe(false);
  });

  it('refuses a verified status that only contains a passed string', async () => {
    const result = await quote(
      withExample({
        procurement_validation: 'passed',
        input_evidence_status: 'verified',
        scenario_id: 'BARE-PASSED',
      }),
    );
    expect(result.calculation_status).toBe('needs_input');
    expect(result.missing_fields).toEqual(
      expect.arrayContaining(['evidence_refs', 'verified_at', 'sales_sku_id', 'purchase_mappings']),
    );
    expect(result.minimum_list_price).toBeNull();
  });

  it('returns unsupported_rule for mixed fee bases, caps, subsidies, and unknown modes', async () => {
    const otherBase = await quote(
      withExample({
        fee_items: [{ name: 'payment', base: 'buyer_payment', rate: '0.05' }],
        scenario_id: 'OTHER-BASE',
      }),
    );
    const capped = await quote(
      withExample({
        fee_items: [{ name: 'capped', base: 'merchant_gross_income', rate: '0.05', max_charge: '1.00' }],
        scenario_id: 'CAPPED',
      }),
    );
    const subsidy = await quote(withExample({ platform_subsidy: '1.00', scenario_id: 'SUBSIDY' }));
    const unknownMode = await quote(withExample({ mode: 'general_forward', scenario_id: 'FORWARD' }));
    const missingAndUnknown = await quote(
      withExample({ mode: 'general_forward', supplier_shipping: null, scenario_id: 'FORWARD-MISSING' }),
    );

    expect(otherBase.calculation_status).toBe('unsupported_rule');
    expect(capped.calculation_status).toBe('unsupported_rule');
    expect(subsidy.calculation_status).toBe('unsupported_rule');
    expect(unknownMode.calculation_status).toBe('unsupported_rule');
    expect(missingAndUnknown.calculation_status).toBe('needs_input');
    expect(otherBase.minimum_list_price).toBeNull();
  });

  it('separates procurement failure, requote, rate mistakes, and a real zero profit', async () => {
    const failed = await quote(withExample({ procurement_validation: 'failed', scenario_id: 'FAILED' }));
    const expired = await quote(
      withExample({ input_evidence_status: 'expired', supplier_shipping: null, scenario_id: 'EXPIRED' }),
    );
    const mismatch = await quote(withExample({ scenario_matches_request: false, scenario_id: 'MISMATCH' }));
    const percent = await quote(
      withExample({
        fee_items: [{ name: 'example_fee', base: 'merchant_gross_income', rate: '5' }],
        scenario_id: 'PERCENT',
      }),
    );
    const zeroProfit = await quote(
      withExample({
        candidate_list_price: '8.43',
        target_contribution: '0.00',
        scenario_id: 'ZERO',
      }),
    );
    const loss = await quote(withExample({ candidate_list_price: '8.00', scenario_id: 'LOSS' }));

    expect(failed.calculation_status).toBe('invalid_procurement');
    expect(expired.calculation_status).toBe('needs_requote');
    expect(expired.purchase_cost).toBeNull();
    expect(mismatch.calculation_status).toBe('needs_requote');
    expect(percent.calculation_status).toBe('invalid_input');
    expect(percent.notes.join(' ')).toContain('0.05');
    expect(zeroProfit.candidate_contribution_unrounded).toBe('0.0085');
    expect(zeroProfit.target_met_in_this_scenario).toBe(true);
    expect(loss.candidate_contribution_unrounded).toBe('-0.4000');
    expect(loss.target_met_in_this_scenario).toBe(false);
    expect(loss.calculation_status).toBe('estimated');
  });

  it('rejects JSON numbers before they become binary floats', async () => {
    const result = await quote(withExample({ goods_total: 5, scenario_id: 'FLOAT' }));
    expect(result.calculation_status).toBe('invalid_input');
    expect(result.purchase_cost).toBeNull();
  });

  it('checks purchase quantity without rounding up to the minimum order', async () => {
    const belowMoq = await quote(
      withExample({
        scenario_id: 'MOQ',
        procurement_lines: [
          {
            line_id: 'pack',
            units_per_sale: '1',
            units_per_purchase: '1',
            unit_price: '5.00',
            moq: '5',
            step: null,
          },
        ],
      }),
    );
    const moqIsNotAMultiple = await quote(
      withExample({
        scenario_id: 'MOQ-NOT-MULTIPLE',
        sales_quantity: '3',
        goods_total: '15.00',
        supplier_shipping: '0.00',
        target_contribution: null,
        candidate_list_price: null,
        procurement_lines: [
          {
            line_id: 'pack',
            units_per_sale: '1',
            units_per_purchase: '1',
            unit_price: '5.00',
            moq: '2',
            step: null,
          },
        ],
      }),
    );
    const badStep = await quote(
      withExample({
        scenario_id: 'STEP',
        sales_quantity: '3',
        procurement_lines: [
          {
            line_id: 'pack',
            units_per_sale: '1',
            units_per_purchase: '1',
            unit_price: '5.00',
            moq: '2',
            step: '2',
          },
        ],
      }),
    );

    expect(belowMoq.calculation_status).toBe('invalid_procurement');
    expect(belowMoq.notes.join(' ')).toContain('不能自动加量');
    expect(moqIsNotAMultiple.calculation_status).toBe('estimated');
    expect(moqIsNotAMultiple.purchase_cost).toBe('15.00');
    expect(badStep.calculation_status).toBe('invalid_procurement');
  });

  it('prices a two-piece pack from the pack price and keeps traced goods totals', async () => {
    const pack = await quote(
      withExample({
        scenario_id: 'PACK',
        sales_quantity: '1',
        goods_total: '5.00',
        supplier_shipping: '3.00',
        procurement_lines: [
          {
            line_id: 'two-piece',
            units_per_sale: '2',
            units_per_purchase: '2',
            unit_price: '5.00',
            moq: null,
            step: null,
          },
        ],
      }),
    );
    const traced = await quote(
      withExample({
        scenario_id: 'TRACED',
        goods_total: '4.50',
        goods_total_authority: 'traced',
        procurement_lines: [
          {
            line_id: 'row',
            units_per_sale: '1',
            units_per_purchase: '1',
            unit_price: '5.00',
            moq: null,
            step: null,
          },
        ],
      }),
    );
    const conflict = await quote(
      withExample({
        scenario_id: 'CONFLICT',
        goods_total: '4.50',
        procurement_lines: [
          {
            line_id: 'row',
            units_per_sale: '1',
            units_per_purchase: '1',
            unit_price: '5.00',
            moq: null,
            step: null,
          },
        ],
      }),
    );

    expect(pack.calculation_status).toBe('estimated');
    expect(pack.detail?.line_goods_total).toBe('5.00');
    expect(traced.purchase_cost).toBe('7.50');
    expect(traced.notes.join(' ')).toContain('可追溯真实合计');
    expect(conflict.calculation_status).toBe('invalid_input');
  });

  it('counts each shipping parcel once and refuses a repeated parcel or a mismatched total', async () => {
    const ok = await quote(
      withExample({
        scenario_id: 'PARCELS',
        shipping_parcels: [
          { parcel_id: 'p1', address_id: 'a1', fee: '2.00' },
          { parcel_id: 'p2', address_id: 'a2', fee: '1.00' },
        ],
      }),
    );
    const duplicate = await quote(
      withExample({
        scenario_id: 'DUP-PARCEL',
        shipping_parcels: [
          { parcel_id: 'p1', address_id: 'a1', fee: '2.00' },
          { parcel_id: 'p1', address_id: 'a2', fee: '1.00' },
        ],
      }),
    );
    const included = await quote(
      withExample({
        scenario_id: 'INCLUDED',
        shipping_included_in_goods: true,
        supplier_shipping: '3.00',
      }),
    );

    expect(ok.purchase_cost).toBe('8.00');
    expect(duplicate.calculation_status).toBe('invalid_input');
    expect(duplicate.notes.join(' ')).toContain('同一个包裹只能计一次');
    expect(included.calculation_status).toBe('invalid_input');
  });

  it('evaluates a pack quantity directly', () => {
    const line: ProcurementLineDraft = {
      lineId: 'pack',
      unitsPerSale: new Decimal(2),
      unitsPerPurchase: new Decimal(2),
      unitPrice: new Decimal('5.00'),
      moq: null,
      step: null,
      allowFractionalUnit: false,
    };
    const result = evaluateProcurementLine(new Decimal(1), line);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quantity.toString()).toBe('1');
      expect(result.lineGoods.toFixed(2)).toBe('5.00');
    }
  });
});
