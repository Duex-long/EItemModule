# 商品模块接入网关

模块 id：`personal.item`  
包名：`@personal-gateway/module-item`  
版本：`1.0.0`  
协议：manifestVersion 1，pluginApiVersion 1  
SDK 范围：`^1.0.0`  
网关范围：`>=0.1.0 <0.2.0`

公开能力：服务 `item.pricing` 1。没有 stage、observer 或外部扩展。声明依赖为空。

interface → 基类 → 实现：

`IGatewayModule<ItemGatewayOptions>` → `BaseGatewayModule<ItemGatewayOptions>` → `ItemGatewayModule`

定价计算仍是 `ISkuPricingStrategy` → `BaseSkuPricingStrategy` → `SkuComputedPricingStrategy`。

## 宿主登记

网关安装同一份 `@personal-gateway/sdk@1.0.0` 和本模块后，在模块目录加入：

```ts
import itemManifest from '@personal-gateway/module-item/manifest.json' with { type: 'json' };
import { defineModuleCatalog } from '@personal-gateway/sdk';

export const moduleCatalog = defineModuleCatalog([
  {
    manifest: itemManifest,
    load: () => import('@personal-gateway/module-item'),
  },
]);
```

配置：

```json
{
  "modules": {
    "personal.item": {
      "enabled": true,
      "options": { "quoteStore": "memory" }
    }
  }
}
```

宿主加载后要确认 `loaded.sdkRuntime === SDK_RUNTIME`。服务 Token 使用 `ITEM_PRICING_SERVICE`，不要在网关里新建同名 Symbol。

`enabled: false` 时不要调用 loader，也不能附带 options。未登记的 id 即使写成 disabled 也要拒绝启动。

## 当前边界

npm 上还没有官方 `@personal-gateway/sdk`。本仓库的 `packages/sdk` 是接入协议的 1.0.0 实现，只包含模块清单、`BaseGatewayModule`、运行时身份和 `item.pricing` Token。流水线、认证、响应、数据库和 `@personal-gateway/testing` 不在这个包里。

因此这里不能把网关仓库的 `module:check` 或 MI02 真实宿主端到端写成已经通过。模块侧已经验证：清单与包元数据一致、禁用选择不调用 loader、prepare/register 不打开文件、生命周期启动后定价结果与原来的示例一致、打包入口外置 SDK。

网关仓库接入时安装本仓库打出的 SDK tarball 和模块 tarball，两边必须解析到同一份 SDK。
