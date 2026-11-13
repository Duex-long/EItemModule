import { Injectable } from '@nestjs/common';
import { BaseSkuPricingStrategy } from '../src/item/pricing/base-sku-pricing-strategy';
import { emptyComputation } from '../src/item/pricing/pricing-result';
import type { PricingComputation, SkuPricingDraft } from '../src/item/pricing/sku-pricing.types';

/** 测试装配用的替换策略，不进入默认生产注册。 */
@Injectable()
export class ReplacementCostStrategy extends BaseSkuPricingStrategy {
  override readonly mode = 'replacement_cost_only';

  protected override validateInput(): PricingComputation | null {
    return null;
  }

  protected override computeQuote(draft: SkuPricingDraft): PricingComputation {
    return emptyComputation({
      calculation_status: 'estimated',
      scenario_id: draft.scenarioId,
      purchase_cost: draft.goodsTotal ? draft.goodsTotal.toFixed(2) : null,
      notes: ['replacement-strategy'],
      input_version: draft.inputVersion,
    });
  }
}

/** 与正式策略声明同一个 mode，用来验证启动时拒绝重复注册。 */
@Injectable()
export class DuplicateModeStrategy extends BaseSkuPricingStrategy {
  override readonly mode = 'same_base_fixed_coupon';

  protected override validateInput(): PricingComputation | null {
    return null;
  }

  protected override computeQuote(draft: SkuPricingDraft): PricingComputation {
    return emptyComputation({
      calculation_status: 'estimated',
      scenario_id: draft.scenarioId,
      notes: ['duplicate'],
    });
  }
}
