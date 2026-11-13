import type { PricingComputation, SkuPricingDraft } from './sku-pricing.types.js';

/**
 * 输入：一个订单测算场景的已解析草稿。金额是十进制数，null 表示缺项。
 * 输出：确定性计算结果。成功时给出采购成本、最低收入、最低标价和候选价验算。
 * 成功语义：calculated 表示证据齐全；estimated 表示关键输入仍是假设或费用未按平台规则取整。
 * 失败语义：needs_input、needs_requote、invalid_procurement、unsupported_rule、invalid_input。
 *   这些都是计算结果，不是抛给进程的异常。亏损和刚好 0 利润通过贡献额表达，不占用失败状态。
 * 副作用：无。策略不写存储、不改售价、不采购、不授权发布。
 * 取消：纯计算，没有可取消的外部资源。
 */
export interface ISkuPricingStrategy {
  readonly mode: string;
  quote(draft: SkuPricingDraft): PricingComputation;
}
