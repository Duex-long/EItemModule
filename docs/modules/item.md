# 商品模块开发卡

模块名称 / 当前工作项：ItemModule / SKU 定价计算

要交付的用户可见功能：调用 `POST /pricing/quote`，按 SKU-PRICING-R1 的同一计费基数、固定商家券模式，返回采购成本、最低商家收入、最低标价和候选价验算。

本次范围 / 暂不包含：

- 包含简化模式 `same_base_fixed_coupon`、采购数量校验、包裹运费合计、结果保存与相同输入复用。
- 不包含通用正向计费规则、商品 CRUD、上架、采购下单、个人服务网关流水线。网关 TD 不在本仓库。

触发入口与输入示例：`POST /pricing/quote`，请求体见 `examples/quote.example.json`。

成功结果 / 拒绝结果 / 异常结果：

- 示例假设返回 `estimated`，采购成本 `8.00`，最低标价 `9.48`，候选贡献 `1.4050`，`publish_authorized` 为 false。
- 证据、舍入规则和 SKU 映射齐全时返回 `calculated`。
- 缺项返回 `needs_input`，不用 0 兜底。
- 过期或场景不匹配返回 `needs_requote`。
- 采购条件不满足返回 `invalid_procurement`，不会向上取整凑起订量。
- 不同计费基数、封顶、阶梯、补贴或未注册模式返回 `unsupported_rule`。
- JSON 数字、负金额、费率大于等于 1 返回 `invalid_input`。
- 请求体不是 JSON 对象时 HTTP 400。

对应 TD 章节与验收编号：本仓库不实现个人服务网关 TD。行为对应《SKU定价计算服务：公式与输入输出 V1》第 2 至 8 节，以及 Module 开发规范中的契约、装配、测试和文档要求。

interface / 文件：`ISkuPricingStrategy` / `src/item/pricing/i-sku-pricing-strategy.ts`

直接基类 / 文件：`BaseSkuPricingStrategy` / `src/item/pricing/base-sku-pricing-strategy.ts`

具体实现类 / 文件：`SkuComputedPricingStrategy` / `src/item/pricing/sku-computed-pricing.strategy.ts`

注册 key/type / Token：`same_base_fixed_coupon` / `SKU_PRICING_STRATEGIES`

前置能力 / 输出能力：无上游代理。输出报价结果和计算明细。

读取 / 写入的上下文字段：无网关上下文。读取报价 JSON，写入报价存储。

新增配置与默认值：

- `SKU_QUOTE_STORE`：缺省 `file`。值为 `memory` 时不落盘。
- `SKU_QUOTE_STORE_PATH`：缺省 `data/sku-quotes.jsonl`。
- `PORT`：缺省 `3000`。
- 必需模式缺省为 `same_base_fixed_coupon`。空字符串路径在文件存储构造时失败。

资源获取、取消和释放：计算本身无外部资源。文件存储在启动时读取已有 JSONL，追加时写入一行。进程退出后由操作系统关闭文件。策略不保存请求级状态。

装配步骤 / 调用方式：`AppModule.forRoot()` 导入 `ItemModule.register()`。控制器只调用 `SkuPricingService`，服务按 `mode` 从注册表选择策略。

可移除条件 / 替换步骤：从 `AppModule.forRoot()` 去掉 `ItemModule` 后，`/pricing/quote` 返回 404。替换时提供另一个 `ISkuPricingStrategy` 实现，并把它放进 `strategyTypes`。重复 mode 或缺少必需 mode 时模块创建失败，进程不会带着空策略继续报价。

测试场景 / 实际测试命令：`npm test`。覆盖示例公式、保本、贡献率、缺项、采购、包裹、舍入上调、装配、拆除、替换和 HTTP。

扩展文档 / 流程图 / 类图位置：

- `docs/item-module-design.md`
- `docs/extensions/sku-computed-pricing-strategy.md`
- `docs/diagrams/sku-pricing-flow.md`
- `docs/diagrams/sku-pricing-inheritance.md`
- `docs/interface-base-class-map.md`

当前状态 / 未完成内容：本模块的简化定价接口已完成。通用正向模式、持久数据库和网关流水线尚未接入。文件存储只保证单进程追加，重启后保留文件中的历史。
