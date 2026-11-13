import type { ISkuPricingStrategy } from './i-sku-pricing-strategy';
import { preliminaryDecision } from './pricing-precheck';
import type { PricingComputation, SkuPricingDraft } from './sku-pricing.types';

/**
 * 功能：固定定价策略的共同入口，先拦截过期、采购失败和缺项，再进入具体公式。
 * 所属模块：ItemModule。
 * 实现接口：ISkuPricingStrategy。
 * 直接基类：无，这是定价策略的抽象基类。
 * 注册标识：由子类的 mode 决定。
 * 覆盖成员：子类覆盖 mode、validateInput、computeQuote。
 * 禁止覆盖：quote。
 * @see docs/extensions/sku-computed-pricing-strategy.md
 */
export abstract class BaseSkuPricingStrategy implements ISkuPricingStrategy {
  abstract readonly mode: string;

  quote(draft: SkuPricingDraft): PricingComputation {
    const blocked = preliminaryDecision(draft);
    if (blocked) {
      return blocked;
    }
    const rejected = this.validateInput(draft);
    if (rejected) {
      return rejected;
    }
    return this.computeQuote(draft);
  }

  protected abstract validateInput(draft: SkuPricingDraft): PricingComputation | null;

  protected abstract computeQuote(draft: SkuPricingDraft): PricingComputation;
}
