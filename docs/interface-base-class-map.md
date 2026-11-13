# interface、基类与实现映射

完整的类型职责和扩展步骤见 `docs/item-module-design.md`。

| interface | 直接基类 | 具体实现 | 注册标识 | 源码 | 测试 | 文档 |
| --- | --- | --- | --- | --- | --- | --- |
| ISkuPricingStrategy | BaseSkuPricingStrategy | SkuComputedPricingStrategy | same_base_fixed_coupon | src/item/pricing/sku-computed-pricing.strategy.ts | test/sku-computed-pricing.strategy.spec.ts | docs/extensions/sku-computed-pricing-strategy.md |
| ISkuQuoteStore | 基类不适用 | InMemorySkuQuoteStore、FileSkuQuoteStore | SKU_QUOTE_STORE | src/item/pricing/sku-quote.store.ts | test/file-sku-quote.store.spec.ts、test/item.module.spec.ts | docs/modules/item.md |

`SkuPricingService`、`SkuPricingController`、`SkuPricingRegistry`、请求解析和采购数量函数是内部能力，不是扩展点，基类不适用。

DI 使用 `SKU_PRICING_STRATEGIES`、`SKU_PRICING_OPTIONS` 和 `SKU_QUOTE_STORE`。interface 本身不是 Token。
