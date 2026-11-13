# 实现进度

| 工作项 | 契约 | 状态 | 证据 | 限制 |
| --- | --- | --- | --- | --- |
| ItemModule SKU 定价 | ISkuPricingStrategy → BaseSkuPricingStrategy → SkuComputedPricingStrategy，模式 same_base_fixed_coupon | 已完成 | `npm test` 3 个套件、28 个测试通过；`tsc -p tsconfig.build.json` 与 `tsc -p tsconfig.spec.json --noEmit` 通过 | 只有简化模式。结果保存在 JSONL 或内存，不是独立数据库。未接入个人服务网关流水线 |
| 模块设计说明 | 同上一行的 interface 与 class | 已完成 | `docs/item-module-design.md` | 文档描述当前代码，不引入新的运行时类型 |
| 网关接入协议 | IGatewayModule → BaseGatewayModule → ItemGatewayModule，id personal.item | 模块侧已验证 | `npm test` 4 个套件、40 个测试通过；`npm run check:package` 核对入口身份和打包清单 | 官方 SDK 与网关宿主尚未发布。`packages/sdk` 只含模块协议和 item.pricing。未执行网关仓库的 module:check 与 MI02 端到端 |

本次没有修改网关认证、路由或代理。那些能力不在 EItemModule 仓库内。
