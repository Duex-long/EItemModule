# ItemGatewayModule

功能：把商品定价装配进网关进程。网关启用 `personal.item` 后，可以通过服务 `item.pricing` 调用 SKU 定价，并在同一进程收到 `POST /pricing/quote`。

所属模块：ItemModule。

实现接口：`IGatewayModule<ItemGatewayOptions>`，通过基类继承。

直接基类：`BaseGatewayModule<ItemGatewayOptions>`，来自 `@personal-gateway/sdk`。

注册标识：模块 id `personal.item`，包名 `@personal-gateway/module-item`。

覆盖成员：`manifest`、`validateOptions`、`requirements`、`createRegistration`。

禁止覆盖：`prepare`、`register`。

源码：`src/item/item.gateway-module.ts`

内部仍然装配 `ItemModule` 和 `SkuComputedPricingStrategy`。接入类不代替定价公式类。

## 对网关公开的内容

| 种类 | 名称 | 说明 |
| --- | --- | --- |
| 模块 id | `personal.item` | 配置 `modules` 里的键 |
| 服务 | `item.pricing` / apiVersion 1 | Token 是 SDK 的 `ITEM_PRICING_SERVICE`，指向 `SkuPricingService` |
| 生命周期 | `ItemQuoteLifecycle` | `start` 打开报价存储，`stop` 关闭。内存存储的 start/stop 不碰文件 |
| stage / observer | 无 | 定价不是流水线节点，接入不会重排 pipeline |

`mayRequireServices` 为空。本模块不依赖数据库或响应模块。

## 配置

`config.schema.json` 与 `validateOptions` 使用同一套规则：

- 未知字段拒绝。
- 未写 `quoteStore` 时默认为 `memory`。
- `quoteStore` 只能是 `memory` 或 `file`。`false` 或 `0` 不能当成默认值。
- `file` 必须带非空 `quoteStorePath`。
- 未写 `requiredModes` 时默认为 `["same_base_fixed_coupon"]`。显式传入 `[]` 会保留空数组。

示例见 `examples/options.json` 和 `examples/gateway-modules.json`。

## 启动顺序

1. 宿主只在 `enabled: true` 时调用 loader。
2. `prepare` 校验 options 并冻结结果，不打开文件。
3. `register` 返回 Nest 动态模块、服务 Token 和生命周期 Token，不创建存储文件。
4. 宿主完成 Nest 初始化后调用 `start(signal)`。文件存储这时才读取 JSONL。
5. `stop` 可重复调用。停止后文件存储拒绝继续报价，再次 `start` 会重新加载。

入口 `src/index.ts` 只导出 `gatewayModule` 和 `sdkRuntime`。导入它不会监听端口。
