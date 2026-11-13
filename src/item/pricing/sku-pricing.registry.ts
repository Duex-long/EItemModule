import { Inject, Injectable } from '@nestjs/common';
import type { ISkuPricingStrategy } from './i-sku-pricing-strategy.js';
import { SKU_PRICING_OPTIONS, SKU_PRICING_STRATEGIES, type SkuPricingOptions } from './sku-pricing.tokens.js';

/**
 * 功能：按 mode 选择定价策略，并在启动时拒绝重复注册和缺失的必需模式。
 * 所属模块：ItemModule。
 * 实现接口：无。非扩展点，基类不适用。
 * 注册标识：不单独注册模式；它读取 SKU_PRICING_STRATEGIES。
 * @see docs/modules/item.md
 */
@Injectable()
export class SkuPricingRegistry {
  private readonly byMode = new Map<string, ISkuPricingStrategy>();

  constructor(
    @Inject(SKU_PRICING_STRATEGIES) strategies: ISkuPricingStrategy[],
    @Inject(SKU_PRICING_OPTIONS) options: SkuPricingOptions,
  ) {
    for (const strategy of strategies) {
      if (this.byMode.has(strategy.mode)) {
        throw new Error(`重复注册 SKU 定价策略: ${strategy.mode}`);
      }
      this.byMode.set(strategy.mode, strategy);
    }
    for (const mode of options.requiredModes) {
      if (!this.byMode.has(mode)) {
        throw new Error(`缺少必需的 SKU 定价策略: ${mode}`);
      }
    }
  }

  get(mode: string): ISkuPricingStrategy | undefined {
    return this.byMode.get(mode);
  }
}
