# SkuComputedPricingStrategy

功能：按 SKU-PRICING-R1 计算同一计费基数、固定商家券场景的采购成本、最低收入、最低标价，并正向验算候选价。

所属模块：ItemModule。

实现接口：`ISkuPricingStrategy`，通过基类继承。

直接基类：`BaseSkuPricingStrategy`。

注册标识：`same_base_fixed_coupon`。

覆盖成员：`mode`、`validateInput`、`computeQuote`。

禁止覆盖：`quote`。测试确认子类原型上没有自己的 `quote`。

源码：`src/item/pricing/sku-computed-pricing.strategy.ts`

## 行为

```text
C = goods_total + supplier_shipping + other_purchase_cost
K = C + selling_fixed_cost + after_sale_reserve
r = 同一基数 merchant_gross_income 的费率之和
R = 标价 - merchant_fixed_coupon
目标金额：R_amount = (K + T) / (1 - r)
目标贡献率：R_margin = K / (1 - r - m)
两者同时存在时取较大值，再向上取到分。
固定商家券加在除法之后。
```

返回最低价前用正向公式再验算。逐项舍入导致目标未达到时，标价每次增加 0.01 元，直到满足或达到步数上限。候选价只验算，不向下改写。

`sales_quantity` 只标识场景。请求里的费用和目标已经是整单口径，策略不会再乘一次。

采购行按 `购买份数 × 每销售份实物数 ÷ 每采购单位实物数` 校验。低于起订量或不合步长时返回 `invalid_procurement`。起订量不会被当成采购倍数，也不会自动加量。

`input_evidence_status` 为 `verified` 时，还必须有 `procurement_validation=passed`、证据引用、核验时间、销售 SKU 和采购映射。未核实舍入规则时，即使其他证据齐全，状态也只能是 `estimated`。

## 非扩展点

以下类型没有基类：

- `SkuPricingService`、`SkuPricingController`、`SkuPricingRegistry`
- `parseQuoteRequest`、`preliminaryDecision`、`evaluateProcurementLine`
- `ISkuQuoteStore` 的 `InMemorySkuQuoteStore` 与 `FileSkuQuoteStore`

## 替换

新模式继承 `BaseSkuPricingStrategy`，声明自己的 `mode`，加入 `ItemModule.register({ strategyTypes })`。不要让新策略继承 `SkuComputedPricingStrategy` 来偷偷改变简化公式。
