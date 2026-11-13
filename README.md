# EItemModule

商品模块的 SKU 定价计算服务。当前实现公式 `SKU-PRICING-R1` 的简化模式 `same_base_fixed_coupon`。

服务只做确定性计算和校验。它不猜测运费、采购规格、费率或利润目标，也不采购、发布或修改售价。`publish_authorized` 固定为 `false`。

## 调用

```bash
npm install
npm test
npm run build
npm start
```

默认监听 `3000`。可以用 `PORT` 修改端口。报价历史默认写到 `data/sku-quotes.jsonl`。设置 `SKU_QUOTE_STORE=memory` 只保存在进程内存；`SKU_QUOTE_STORE_PATH` 可改文件位置。

```bash
curl -s -X POST http://127.0.0.1:3000/pricing/quote \
  -H 'content-type: application/json' \
  -d @examples/quote.example.json
```

`examples/quote.example.json` 是规格中的示例，不是实时货源或批准售价。成功时采购成本为 `8.00`，最低标价为 `9.48`，候选价 `9.90` 的未取整贡献为 `1.4050`。

读取已保存结果：

```bash
curl -s http://127.0.0.1:3000/pricing/quotes/<calculation_id>
```

金额和费率必须是十进制字符串。`5%` 传入 `"0.05"`，不能传 JSON 数字，也不能传 `5`。

## 计算类

定价功能由 `SkuComputedPricingStrategy` 完成，经 `SkuPricingService` 暴露为 `POST /pricing/quote`。

| 角色 | 名称 | 注册标识 |
| --- | --- | --- |
| 模块 | ItemModule | Nest 模块 |
| interface | ISkuPricingStrategy | 不是 DI Token |
| 基类 | BaseSkuPricingStrategy | 模板方法 `quote` 不可覆盖 |
| 实现 | SkuComputedPricingStrategy | `same_base_fixed_coupon` |
| DI Token | `SKU_PRICING_STRATEGIES` | 策略数组 |

业务结果用 `calculation_status` 表示，包括 `calculated`、`estimated`、`needs_input`、`unsupported_rule`、`invalid_procurement`、`needs_requote` 和 `invalid_input`。缺项不会用 `0` 代替。相同输入复用已有记录，不覆盖历史。

## 文档

- `docs/modules/item.md`
- `docs/extensions/sku-computed-pricing-strategy.md`
- `docs/interface-base-class-map.md`
- `docs/diagrams/sku-pricing-flow.md`
- `docs/implementation-progress.md`
