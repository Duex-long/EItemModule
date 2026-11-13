import { type DynamicModule, Module, type Type } from '@nestjs/common';
import { ITEM_PRICING_SERVICE } from '@personal-gateway/sdk';
import type { ISkuPricingStrategy } from './pricing/i-sku-pricing-strategy.js';
import { ItemQuoteLifecycle } from './pricing/item-quote.lifecycle.js';
import { SkuComputedPricingStrategy } from './pricing/sku-computed-pricing.strategy.js';
import { SkuPricingController } from './pricing/sku-pricing.controller.js';
import { SkuPricingRegistry } from './pricing/sku-pricing.registry.js';
import { SkuPricingService } from './pricing/sku-pricing.service.js';
import {
  SKU_PRICING_OPTIONS,
  SKU_PRICING_STRATEGIES,
  SKU_QUOTE_STORE,
  type SkuPricingOptions,
} from './pricing/sku-pricing.tokens.js';
import { FileSkuQuoteStore, InMemorySkuQuoteStore } from './pricing/sku-quote.store.js';

export interface ItemModuleRegisterOptions {
  requiredModes?: string[];
  quoteStore?: 'memory' | 'file';
  quoteStorePath?: string;
  strategyTypes?: Array<Type<ISkuPricingStrategy>>;
}

@Module({})
export class ItemModule {
  static register(options: ItemModuleRegisterOptions = {}): DynamicModule {
    const strategyTypes = options.strategyTypes ?? [SkuComputedPricingStrategy];
    const pricingOptions: SkuPricingOptions = {
      requiredModes: options.requiredModes ?? ['same_base_fixed_coupon'],
      quoteStore: options.quoteStore ?? 'file',
      quoteStorePath: options.quoteStorePath ?? 'data/sku-quotes.jsonl',
    };

    return {
      module: ItemModule,
      controllers: [SkuPricingController],
      providers: [
        ...strategyTypes,
        { provide: SKU_PRICING_OPTIONS, useValue: pricingOptions },
        {
          provide: SKU_PRICING_STRATEGIES,
          useFactory: (...strategies: ISkuPricingStrategy[]) => strategies,
          inject: strategyTypes,
        },
        SkuPricingRegistry,
        {
          provide: SKU_QUOTE_STORE,
          useFactory: (opts: SkuPricingOptions) =>
            opts.quoteStore === 'memory' ? new InMemorySkuQuoteStore() : new FileSkuQuoteStore(opts.quoteStorePath),
          inject: [SKU_PRICING_OPTIONS],
        },
        SkuPricingService,
        { provide: ITEM_PRICING_SERVICE, useExisting: SkuPricingService },
        ItemQuoteLifecycle,
      ],
      exports: [
        SkuPricingService,
        SkuPricingRegistry,
        SKU_QUOTE_STORE,
        SKU_PRICING_STRATEGIES,
        ITEM_PRICING_SERVICE,
        ItemQuoteLifecycle,
      ],
    };
  }
}
