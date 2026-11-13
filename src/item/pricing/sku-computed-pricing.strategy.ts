import { Injectable } from '@nestjs/common';
import {
  ceilToCent,
  Decimal,
  FORMULA_VERSION,
  formatContribution,
  formatMoney,
  formatRate,
  MERCHANT_GROSS_INCOME_BASE,
  SAME_BASE_FIXED_COUPON_MODE,
  sameMoney,
  SUPPORTED_CURRENCY,
} from './decimal-money';
import { BaseSkuPricingStrategy } from './base-sku-pricing-strategy';
import { evaluateProcurementLine } from './procurement-quantity';
import { blankDetail, emptyComputation } from './pricing-result';
import type {
  FeeDraft,
  FeeRounding,
  PricingComputation,
  ReadySkuPricingDraft,
  SkuPricingDraft,
} from './sku-pricing.types';

const PASSING_PROCUREMENT = new Set(['passed', 'passed_for_example']);
const KNOWN_EVIDENCE = new Set(['verified', 'example_assumptions', 'assumption', 'expired', 'scenario_mismatch']);
const KNOWN_ROUNDING = new Set<FeeRounding>(['unrounded_estimate', 'per_item_half_up', 'per_item_ceil']);
const MAX_CENT_ADJUSTMENTS = 100_000;
const EXAMPLE_NOTE = '仅为示例假设，未确认实际费用和售后损耗';

interface ForwardCheck {
  merchantIncome: Decimal;
  contribution: Decimal;
  unroundedContribution: Decimal;
  margin: Decimal | null;
  targetMet: boolean | null;
}

/**
 * 功能：按 SKU-PRICING-R1 的同一计费基数、固定商家券模式，计算采购成本、最低收入、最低标价，并正向验算候选价。
 * 所属模块：ItemModule。
 * 实现接口：ISkuPricingStrategy（通过基类继承）。
 * 直接基类：BaseSkuPricingStrategy。
 * 注册标识：same_base_fixed_coupon。
 * 覆盖成员：mode、validateInput、computeQuote。
 * 禁止覆盖：quote。
 * @see docs/extensions/sku-computed-pricing-strategy.md
 */
@Injectable()
export class SkuComputedPricingStrategy extends BaseSkuPricingStrategy {
  override readonly mode = SAME_BASE_FIXED_COUPON_MODE;

  protected override validateInput(draft: SkuPricingDraft): PricingComputation | null {
    const notes: string[] = [];
    const unsupported: string[] = [];

    if (draft.mode !== this.mode) {
      return this.fail(draft, 'unsupported_rule', [`${this.mode} 不处理模式 ${draft.mode ?? ''}`]);
    }
    if (draft.formulaVersion !== FORMULA_VERSION) {
      return this.fail(draft, 'invalid_input', [`仅接受公式版本 ${FORMULA_VERSION}`]);
    }
    if (draft.verifiedAt && Number.isNaN(Date.parse(draft.verifiedAt))) {
      return this.fail(draft, 'invalid_input', ['verified_at 不是可解析的时间']);
    }
    if (draft.currency !== SUPPORTED_CURRENCY) {
      return this.fail(draft, 'invalid_input', [`币种仅支持 ${SUPPORTED_CURRENCY}`]);
    }
    if (!draft.inputEvidenceStatus || !KNOWN_EVIDENCE.has(draft.inputEvidenceStatus)) {
      return this.fail(draft, 'needs_input', ['无法识别 input_evidence_status'], ['input_evidence_status']);
    }
    if (!draft.procurementValidation || !PASSING_PROCUREMENT.has(draft.procurementValidation)) {
      return this.fail(draft, 'invalid_procurement', ['采购校验值不能用于计价']);
    }
    if (!draft.feeRounding || !KNOWN_ROUNDING.has(draft.feeRounding as FeeRounding)) {
      return this.fail(draft, 'unsupported_rule', ['没有已支持的费用舍入规则，不能自行假设舍入']);
    }

    this.collectUnsupportedRules(draft, unsupported);
    if (unsupported.length > 0) {
      return this.fail(draft, 'unsupported_rule', unsupported);
    }

    const ready = this.asReady(draft);
    if (ready.salesQuantity.lte(0)) {
      notes.push('sales_quantity 必须大于 0；它只标识场景，不会再次乘到费用上');
    }
    this.collectMoneyErrors(ready, notes);
    this.collectRateErrors(ready, notes);
    if (notes.length > 0) {
      return this.fail(draft, 'invalid_input', notes);
    }

    const verifiedGap = this.verifiedEvidenceGap(ready);
    if (verifiedGap) {
      return verifiedGap;
    }

    const procurement = this.checkProcurementLines(ready);
    if (procurement) {
      return procurement;
    }

    const shipping = this.checkShipping(ready);
    if (shipping) {
      return shipping;
    }

    return null;
  }

  protected override computeQuote(draft: SkuPricingDraft): PricingComputation {
    const ready = this.asReady(draft);
    const rounding = ready.feeRounding as FeeRounding;
    const rates = ready.feeItems.map((item) => item.rate as Decimal);
    const totalRate = rates.reduce((sum, rate) => sum.plus(rate), new Decimal(0));
    const lineGoods = this.lineGoodsTotal(ready);
    const goodsTotal = ready.goodsTotal;
    if (lineGoods && !sameMoney(lineGoods, goodsTotal) && ready.goodsTotalAuthority !== 'traced') {
      return this.fail(draft, 'invalid_input', [
        `采购行乘法合计 ${formatMoney(lineGoods)} 与 goods_total ${formatMoney(goodsTotal)} 不一致。有行取整或优惠时请把 goods_total_authority 设为 traced，并传入可追溯货款`,
      ]);
    }

    const purchaseCost = goodsTotal.plus(ready.supplierShipping).plus(ready.otherPurchaseCost);
    const fixedCost = purchaseCost.plus(ready.sellingFixedCost).plus(ready.afterSaleReserve);
    const coupon = ready.merchantFixedCoupon;
    const targetContribution = ready.targetContribution;
    const targetMargin = ready.targetMargin;
    const hasAmountTarget = targetContribution !== null;
    const hasMarginTarget = targetMargin !== null;
    const notes = this.assumptionNotes(ready, rounding);
    const detail = blankDetail();
    detail.sales_quantity = ready.salesQuantity.toString();
    detail.goods_total = formatMoney(goodsTotal);
    detail.supplier_shipping = formatMoney(ready.supplierShipping);
    detail.other_purchase_cost = formatMoney(ready.otherPurchaseCost);
    detail.purchase_cost = formatMoney(purchaseCost);
    detail.selling_fixed_cost = formatMoney(ready.sellingFixedCost);
    detail.after_sale_reserve = formatMoney(ready.afterSaleReserve);
    detail.fixed_cost_k = formatMoney(fixedCost);
    detail.total_rate = formatRate(totalRate);
    detail.merchant_fixed_coupon = formatMoney(coupon);
    detail.target_contribution = targetContribution ? formatContribution(targetContribution) : null;
    detail.target_margin = targetMargin ? formatRate(targetMargin) : null;
    detail.fee_rounding = rounding;
    detail.line_goods_total = lineGoods ? formatMoney(lineGoods) : null;
    detail.goods_total_authority = ready.goodsTotalAuthority;
    if (lineGoods && ready.goodsTotalAuthority === 'traced' && !sameMoney(lineGoods, goodsTotal)) {
      notes.push('货款使用可追溯真实合计，没有用采购行乘法覆盖');
    }

    let minimumIncome: Decimal | null = null;
    let minimumList: Decimal | null = null;
    if (hasAmountTarget || hasMarginTarget) {
      const rawTarget = this.rawTargetIncome(fixedCost, totalRate, targetContribution, targetMargin);
      detail.raw_target_income = rawTarget.toString();
      if (rawTarget.lte(0)) {
        return this.fail(draft, 'invalid_input', ['目标收入不是正数，不能给出零元或负售价']);
      }
      const bumped = this.raiseUntilTarget(
        ceilToCent(rawTarget.plus(coupon)),
        fixedCost,
        totalRate,
        ready.feeItems,
        rounding,
        coupon,
        targetContribution,
        targetMargin,
      );
      if (!bumped.met || !bumped.listPrice) {
        return this.fail(draft, 'invalid_input', ['按 0.01 元上调后仍未同时满足目标金额和目标贡献率']);
      }
      minimumList = bumped.listPrice;
      minimumIncome = bumped.listPrice.minus(coupon);
      detail.price_adjustments_of_one_cent = bumped.adjustments;
      if (bumped.forward) {
        detail.forward_check = {
          merchant_income: formatMoney(bumped.forward.merchantIncome),
          contribution: formatContribution(bumped.forward.contribution),
          margin: bumped.forward.margin ? formatRate(bumped.forward.margin) : null,
          target_met: bumped.forward.targetMet === true,
        };
      }
      if (bumped.adjustments > 0) {
        notes.push(`手续费取整后未达到目标，最低价已按 0.01 元上调 ${bumped.adjustments} 次`);
      }
    }

    let candidatePrice: string | null = null;
    let candidateContribution: string | null = null;
    let targetMet: boolean | null = null;
    if (ready.candidateListPrice) {
      const candidate = this.forward(
        ready.candidateListPrice,
        fixedCost,
        totalRate,
        ready.feeItems,
        rounding,
        coupon,
        targetContribution,
        targetMargin,
      );
      candidatePrice = formatMoney(ready.candidateListPrice);
      candidateContribution = formatContribution(candidate.unroundedContribution);
      targetMet = candidate.targetMet;
      detail.candidate_forward = {
        merchant_income: formatMoney(candidate.merchantIncome),
        contribution_unrounded: formatContribution(candidate.unroundedContribution),
        contribution_with_fee_rounding: formatContribution(candidate.contribution),
        margin: candidate.margin ? formatRate(candidate.margin) : null,
        target_met: candidate.targetMet,
      };
    }

    return emptyComputation({
      calculation_status: this.calculationStatus(ready, rounding),
      scenario_id: ready.scenarioId,
      purchase_cost: formatMoney(purchaseCost),
      total_rate: formatRate(totalRate),
      minimum_merchant_income: minimumIncome ? formatMoney(minimumIncome) : null,
      minimum_list_price: minimumList ? formatMoney(minimumList) : null,
      candidate_list_price: candidatePrice,
      candidate_contribution_unrounded: candidateContribution,
      target_met_in_this_scenario: targetMet,
      evidence_refs: ready.evidenceRefs,
      notes,
      input_version: ready.inputVersion,
      detail,
    });
  }

  private calculationStatus(draft: ReadySkuPricingDraft, rounding: FeeRounding): 'calculated' | 'estimated' {
    if (
      draft.inputEvidenceStatus === 'verified' &&
      draft.procurementValidation === 'passed' &&
      rounding !== 'unrounded_estimate'
    ) {
      return 'calculated';
    }
    return 'estimated';
  }

  private assumptionNotes(draft: ReadySkuPricingDraft, rounding: FeeRounding): string[] {
    if (draft.inputEvidenceStatus === 'example_assumptions') {
      return [EXAMPLE_NOTE];
    }
    const notes: string[] = [];
    if (draft.inputEvidenceStatus === 'assumption' || draft.procurementValidation === 'passed_for_example') {
      notes.push('关键输入是测算假设，结果不是已核实报价');
    }
    if (draft.inputEvidenceStatus === 'verified' && rounding === 'unrounded_estimate') {
      notes.push('未核实逐项舍入规则，结果只能作为未取整估算');
    }
    return notes;
  }

  private rawTargetIncome(
    fixedCost: Decimal,
    totalRate: Decimal,
    targetContribution: Decimal | null,
    targetMargin: Decimal | null,
  ): Decimal {
    const denominator = new Decimal(1).minus(totalRate);
    const amountTarget = targetContribution ? fixedCost.plus(targetContribution).div(denominator) : null;
    const marginDenominator = targetMargin ? denominator.minus(targetMargin) : null;
    const marginTarget = marginDenominator ? fixedCost.div(marginDenominator) : null;
    if (amountTarget && marginTarget) {
      return Decimal.max(amountTarget, marginTarget);
    }
    return (amountTarget ?? marginTarget) as Decimal;
  }

  private raiseUntilTarget(
    startList: Decimal,
    fixedCost: Decimal,
    totalRate: Decimal,
    feeItems: FeeDraft[],
    rounding: FeeRounding,
    coupon: Decimal,
    targetContribution: Decimal | null,
    targetMargin: Decimal | null,
  ): { met: boolean; listPrice: Decimal | null; adjustments: number; forward: ForwardCheck | null } {
    let listPrice = startList;
    for (let adjustments = 0; adjustments <= MAX_CENT_ADJUSTMENTS; adjustments += 1) {
      const forward = this.forward(
        listPrice,
        fixedCost,
        totalRate,
        feeItems,
        rounding,
        coupon,
        targetContribution,
        targetMargin,
      );
      if (forward.targetMet === true) {
        return { met: true, listPrice, adjustments, forward };
      }
      listPrice = listPrice.plus('0.01');
    }
    return { met: false, listPrice: null, adjustments: MAX_CENT_ADJUSTMENTS, forward: null };
  }

  private forward(
    listPrice: Decimal,
    fixedCost: Decimal,
    totalRate: Decimal,
    feeItems: FeeDraft[],
    rounding: FeeRounding,
    coupon: Decimal,
    targetContribution: Decimal | null,
    targetMargin: Decimal | null,
  ): ForwardCheck {
    const merchantIncome = listPrice.minus(coupon);
    const unroundedFee = merchantIncome.mul(totalRate);
    const unroundedContribution = merchantIncome.minus(unroundedFee).minus(fixedCost);
    const roundedFee = this.feeTotal(merchantIncome, feeItems, rounding);
    const contribution = merchantIncome.minus(roundedFee).minus(fixedCost);
    const margin = merchantIncome.gt(0) ? contribution.div(merchantIncome) : null;
    const hasTarget = targetContribution !== null || targetMargin !== null;
    let targetMet: boolean | null = null;
    if (hasTarget) {
      const amountOk = targetContribution === null || contribution.gte(targetContribution);
      const marginOk = targetMargin === null || (margin !== null && margin.gte(targetMargin));
      targetMet = merchantIncome.gt(0) && amountOk && marginOk;
    }
    return { merchantIncome, contribution, unroundedContribution, margin, targetMet };
  }

  private feeTotal(merchantIncome: Decimal, feeItems: FeeDraft[], rounding: FeeRounding): Decimal {
    return feeItems.reduce((sum, item) => {
      const raw = merchantIncome.mul(item.rate as Decimal);
      return sum.plus(this.roundFee(raw, rounding));
    }, new Decimal(0));
  }

  private roundFee(amount: Decimal, rounding: FeeRounding): Decimal {
    if (rounding === 'per_item_ceil') {
      return ceilToCent(amount);
    }
    if (rounding === 'per_item_half_up') {
      return amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }
    return amount;
  }

  private collectUnsupportedRules(draft: SkuPricingDraft, unsupported: string[]): void {
    if (draft.platformSubsidyPresent) {
      unsupported.push('存在平台补贴，简化模式不能把补贴直接算进同一基数');
    }
    if (draft.platformCouponPresent) {
      unsupported.push('存在平台优惠，不能套用固定商家券公式');
    }
    if (draft.unincludedSubsidyPresent) {
      unsupported.push('存在未包含补贴，简化模式不支持');
    }
    if (draft.multiItemDiscountPresent) {
      unsupported.push('存在多件折扣，不能套用固定商家券公式');
    }
    for (const item of draft.feeItems ?? []) {
      if (item.base !== MERCHANT_GROSS_INCOME_BASE) {
        unsupported.push(`费用 ${item.name} 的计费基数不是 ${MERCHANT_GROSS_INCOME_BASE}，不能合并费率`);
      }
      if (item.minCharge || item.maxCharge || item.tiersPresent || item.threshold || item.subsidy) {
        unsupported.push(`费用 ${item.name} 含有最低收费、封顶、阶梯、门槛或补贴，简化模式不支持`);
      }
    }
  }

  private collectMoneyErrors(draft: ReadySkuPricingDraft, notes: string[]): void {
    const fields: Array<[string, Decimal]> = [
      ['goods_total', draft.goodsTotal],
      ['supplier_shipping', draft.supplierShipping],
      ['other_purchase_cost', draft.otherPurchaseCost],
      ['selling_fixed_cost', draft.sellingFixedCost],
      ['after_sale_reserve', draft.afterSaleReserve],
      ['merchant_fixed_coupon', draft.merchantFixedCoupon],
    ];
    for (const [name, value] of fields) {
      if (value.lt(0)) {
        notes.push(`${name} 不能为负`);
      }
      if (!value.eq(value.toDecimalPlaces(2))) {
        notes.push(`${name} 最多保留到分`);
      }
    }
    if (draft.candidateListPrice && !draft.candidateListPrice.eq(draft.candidateListPrice.toDecimalPlaces(2))) {
      notes.push('candidate_list_price 最多保留到分');
    }
    if (draft.targetContribution && !draft.targetContribution.eq(draft.targetContribution.toDecimalPlaces(2))) {
      notes.push('target_contribution 最多保留到分');
    }
    if (draft.targetContribution?.lt(0)) {
      notes.push('target_contribution 不能为负；保本请明确传入 0');
    }
    if (draft.targetMargin?.lt(0)) {
      notes.push('target_margin 不能为负');
    }
    if (draft.candidateListPrice?.lt(0)) {
      notes.push('candidate_list_price 不能为负');
    }
  }

  private collectRateErrors(draft: ReadySkuPricingDraft, notes: string[]): void {
    let totalRate = new Decimal(0);
    for (const item of draft.feeItems) {
      const rate = item.rate as Decimal;
      if (rate.lt(0)) {
        notes.push(`费用 ${item.name} 的费率不能为负`);
      }
      totalRate = totalRate.plus(rate);
    }
    if (new Decimal(1).minus(totalRate).lte(0)) {
      notes.push('费率之和必须小于 1。5% 应传入 0.05，不能传入 5');
    }
    if (draft.targetMargin && new Decimal(1).minus(totalRate).minus(draft.targetMargin).lte(0)) {
      notes.push('启用贡献率目标时必须满足 1 - 费率之和 - 目标贡献率 > 0');
    }
  }

  private verifiedEvidenceGap(draft: ReadySkuPricingDraft): PricingComputation | null {
    if (draft.inputEvidenceStatus !== 'verified') {
      return null;
    }
    const missing: string[] = [];
    if (draft.procurementValidation !== 'passed') {
      missing.push('procurement_validation');
    }
    if (draft.evidenceRefs.length === 0) {
      missing.push('evidence_refs');
    }
    if (!draft.verifiedAt) {
      missing.push('verified_at');
    }
    if (!draft.salesSkuId) {
      missing.push('sales_sku_id');
    }
    if (!draft.purchaseMappings || draft.purchaseMappings.length === 0) {
      missing.push('purchase_mappings');
    }
    if (missing.length > 0) {
      return this.fail(
        draft,
        'needs_input',
        ['证据状态为 verified 时，不能只凭一个 passed 字符串计价'],
        missing,
      );
    }
    return null;
  }

  private checkProcurementLines(draft: ReadySkuPricingDraft): PricingComputation | null {
    if (!draft.procurementLines) {
      return null;
    }
    for (const line of draft.procurementLines) {
      const result = evaluateProcurementLine(draft.salesQuantity, line);
      if (!result.ok) {
        return this.fail(draft, 'invalid_procurement', [result.reason]);
      }
    }
    return null;
  }

  private lineGoodsTotal(draft: ReadySkuPricingDraft): Decimal | null {
    if (!draft.procurementLines || draft.procurementLines.length === 0) {
      return null;
    }
    return draft.procurementLines.reduce((sum, line) => {
      const result = evaluateProcurementLine(draft.salesQuantity, line);
      if (!result.ok) {
        return sum;
      }
      return sum.plus(result.lineGoods);
    }, new Decimal(0));
  }

  private checkShipping(draft: ReadySkuPricingDraft): PricingComputation | null {
    if (draft.shippingIncludedInGoods && !draft.supplierShipping.isZero()) {
      return this.fail(draft, 'invalid_input', ['货款已含运费时，supplier_shipping 必须是已核实的 0，不能重复计入']);
    }
    if (draft.packagingIncludedInGoods && !draft.otherPurchaseCost.isZero()) {
      return this.fail(draft, 'invalid_input', ['货款已含包装或代发费时，other_purchase_cost 必须是已核实的 0']);
    }
    if (!draft.shippingParcels) {
      return null;
    }
    const seen = new Set<string>();
    let parcelTotal = new Decimal(0);
    for (const parcel of draft.shippingParcels) {
      if (seen.has(parcel.parcelId)) {
        return this.fail(draft, 'invalid_input', [`包裹 ${parcel.parcelId} 重复计费，同一个包裹只能计一次运费`]);
      }
      seen.add(parcel.parcelId);
      if (parcel.fee.lt(0)) {
        return this.fail(draft, 'invalid_input', [`包裹 ${parcel.parcelId} 的运费不能为负`]);
      }
      parcelTotal = parcelTotal.plus(parcel.fee);
    }
    if (!sameMoney(parcelTotal, draft.supplierShipping)) {
      return this.fail(draft, 'invalid_input', [
        `包裹运费合计 ${formatMoney(parcelTotal)} 与 supplier_shipping ${formatMoney(draft.supplierShipping)} 不一致`,
      ]);
    }
    return null;
  }

  private asReady(draft: SkuPricingDraft): ReadySkuPricingDraft {
    if (
      draft.formulaVersion === null ||
      draft.mode === null ||
      draft.currency === null ||
      draft.scenarioId === null ||
      draft.salesQuantity === null ||
      draft.procurementValidation === null ||
      draft.goodsTotal === null ||
      draft.supplierShipping === null ||
      draft.otherPurchaseCost === null ||
      draft.sellingFixedCost === null ||
      draft.afterSaleReserve === null ||
      draft.feeItems === null ||
      draft.merchantFixedCoupon === null ||
      draft.inputEvidenceStatus === null ||
      draft.feeRounding === null
    ) {
      throw new Error('定价策略收到了尚未拦截的缺项');
    }
    if (draft.feeItems.some((item) => item.rate === null)) {
      throw new Error('定价策略收到了缺少费率的费用项');
    }
    return draft as ReadySkuPricingDraft;
  }

  private fail(
    draft: SkuPricingDraft,
    status: PricingComputation['calculation_status'],
    notes: string[],
    missingFields: string[] = [],
  ): PricingComputation {
    return emptyComputation({
      calculation_status: status,
      scenario_id: draft.scenarioId,
      missing_fields: missingFields,
      evidence_refs: draft.evidenceRefs,
      notes,
      input_version: draft.inputVersion,
    });
  }
}
