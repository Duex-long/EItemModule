import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { ISkuPricingStrategy } from './pricing/i-sku-pricing-strategy';
import { SkuComputedPricingStrategy } from './pricing/sku-computed-pricing.strategy';
import { SkuPricingController } from './pricing/sku-pricing.controller';
import { SkuPricingRegistry } from './pricing/sku-pricing.registry';
import { SkuPricingService } from './pricing/sku-pricing.service';
import {
  SKU_PRICING_OPTIONS,
  SKU_PRICING_STRATEGIES,
  SKU_QUOTE_STORE,
  type SkuPricingOptions,
} from './pricing/sku-pricing.tokens';
import { FileSkuQuoteStore, InMemorySkuQuoteStore } from './pricing/sku-quote.store';

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
      ],
      exports: [SkuPricingService, SkuPricingRegistry, SKU_QUOTE_STORE, SKU_PRICING_STRATEGIES],
    };
  }
}
