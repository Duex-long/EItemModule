export const ITEM_PRICING_SERVICE = Symbol('ITEM_PRICING_SERVICE');

export interface ServiceCatalogEntry {
  readonly key: string;
  readonly apiVersion: number;
  readonly token: symbol;
}

/**
 * 当前协议包只登记商品定价服务。
 * 数据库、响应等服务要等网关仓库发布完整 SDK 后再进入同一目录，不能在模块里各造一个 Symbol。
 */
export const SERVICE_CATALOG: readonly ServiceCatalogEntry[] = Object.freeze([
  Object.freeze({ key: 'item.pricing', apiVersion: 1, token: ITEM_PRICING_SERVICE }),
]);

export function findService(key: string, apiVersion: number): ServiceCatalogEntry | undefined {
  return SERVICE_CATALOG.find((entry) => entry.key === key && entry.apiVersion === apiVersion);
}
