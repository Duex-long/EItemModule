import { emptyComputation } from './pricing-result.js';
import type { PricingComputation, SkuPricingDraft } from './sku-pricing.types.js';

const EXPLICIT_PROCUREMENT_FAILURES = new Set(['failed', 'invalid', 'rejected']);

/**
 * 公式计算前的共同拦截。未知模式也必须先走这里，
 * 避免过期场景或缺项被报成unsupported_rule，或被用 0 继续算。
 * 非扩展点，基类不适用。
 */
export function preliminaryDecision(draft: SkuPricingDraft): PricingComputation | null {
  if (isRequote(draft)) {
    return emptyComputation({
      calculation_status: 'needs_requote',
      scenario_id: draft.scenarioId,
      missing_fields: draft.missingFields,
      evidence_refs: draft.evidenceRefs,
      notes: ['输入已过期或场景不匹配，需要按当前订单重新取数后再计算'],
      input_version: draft.inputVersion,
    });
  }

  if (draft.procurementValidation && EXPLICIT_PROCUREMENT_FAILURES.has(draft.procurementValidation)) {
    return emptyComputation({
      calculation_status: 'invalid_procurement',
      scenario_id: draft.scenarioId,
      evidence_refs: draft.evidenceRefs,
      notes: ['采购校验未通过。不能向上取整或自动加量来凑起订量'],
      input_version: draft.inputVersion,
    });
  }

  if (draft.missingFields.length > 0) {
    return emptyComputation({
      calculation_status: 'needs_input',
      scenario_id: draft.scenarioId,
      missing_fields: draft.missingFields,
      evidence_refs: draft.evidenceRefs,
      notes: ['缺少必要输入，未用 0 代替'],
      input_version: draft.inputVersion,
    });
  }

  return null;
}

export function isRequote(draft: SkuPricingDraft): boolean {
  return (
    draft.inputEvidenceStatus === 'expired' ||
    draft.inputEvidenceStatus === 'scenario_mismatch' ||
    draft.scenarioMatchesRequest === false
  );
}
