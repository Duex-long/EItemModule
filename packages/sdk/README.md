# @personal-gateway/sdk

这是商品模块接入网关所用的协议包，版本 1.0.0。

当前只提供模块清单、`BaseGatewayModule`、SDK 运行时身份，以及服务 `item.pricing` 的公共 Token。流水线、认证、响应和数据库接口尚未包含在这个包里。

网关和商品模块必须安装同一份包。商品模块的入口重新导出这里的 `SDK_RUNTIME`，宿主用对象身份核对，不能各复制一份同名 Symbol。
