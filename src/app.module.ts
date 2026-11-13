import { type DynamicModule, Module } from '@nestjs/common';
import { ItemModule } from './item/item.module.js';

@Module({})
export class AppModule {
  static forRoot(): DynamicModule {
    const quoteStore = process.env.SKU_QUOTE_STORE === 'memory' ? 'memory' : 'file';
    return {
      module: AppModule,
      imports: [
        ItemModule.register({
          quoteStore,
          quoteStorePath: process.env.SKU_QUOTE_STORE_PATH ?? 'data/sku-quotes.jsonl',
        }),
      ],
    };
  }
}
