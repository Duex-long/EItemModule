import { Inject, Injectable } from '@nestjs/common';
import type { IGatewayModuleLifecycle } from '@personal-gateway/sdk';
import type { ISkuQuoteStore } from './sku-quote.store.js';
import { SKU_QUOTE_STORE } from './sku-pricing.tokens.js';

/**
 * 功能：在网关生命周期里打开和关闭报价存储。
 * 所属模块：ItemModule。
 * 实现接口：IGatewayModuleLifecycle。
 * 直接基类：无。非扩展点，基类不适用。
 * @see docs/extensions/item-gateway-module.md
 */
@Injectable()
export class ItemQuoteLifecycle implements IGatewayModuleLifecycle {
  private started = false;

  constructor(@Inject(SKU_QUOTE_STORE) private readonly store: ISkuQuoteStore) {}

  async start(signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      throw new Error('商品模块启动已取消');
    }
    if (this.started) {
      return;
    }
    await this.store.start();
    if (signal.aborted) {
      await this.store.stop();
      throw new Error('商品模块启动已取消');
    }
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    await this.store.stop();
    this.started = false;
  }
}
