import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FORMULA_VERSION } from './decimal-money.js';
import { parseQuoteRequest } from './parse-quote-request.js';
import { preliminaryDecision } from './pricing-precheck.js';
import { emptyComputation } from './pricing-result.js';
import { canonicalRequestHash } from './request-hash.js';
import type { ISkuQuoteStore } from './sku-quote.store.js';
import { SkuPricingRegistry } from './sku-pricing.registry.js';
import { SKU_QUOTE_STORE } from './sku-pricing.tokens.js';
import type { PricingComputation, SkuQuoteResponse } from './sku-pricing.types.js';

/**
 * 功能：接收报价请求，选择定价策略，保存计算结果并复用相同输入。
 * 所属模块：ItemModule。
 * 实现接口：无。非扩展点，基类不适用。
 * 说明：发布授权固定为 false。本服务不采购、不改价、不调用大模型。
 * @see docs/modules/item.md
 */
@Injectable()
export class SkuPricingService {
  constructor(
    private readonly registry: SkuPricingRegistry,
    @Inject(SKU_QUOTE_STORE) private readonly store: ISkuQuoteStore,
  ) {}

  quote(raw: Record<string, unknown>): SkuQuoteResponse {
    const inputHash = canonicalRequestHash(raw);
    const existing = this.store.findByHash(inputHash);
    if (existing) {
      return { ...existing.response, reused: true };
    }
    const response = this.wrap(this.compute(raw));
    this.store.append({
      calculationId: response.calculation_id,
      inputHash,
      createdAt: response.created_at,
      response,
    });
    return response;
  }

  findById(calculationId: string): SkuQuoteResponse | null {
    return this.store.findById(calculationId)?.response ?? null;
  }

  private compute(raw: Record<string, unknown>): PricingComputation {
    const parsed = parseQuoteRequest(raw);
    if (!parsed.ok) {
      return parsed.error;
    }
    const blocked = preliminaryDecision(parsed.draft);
    if (blocked) {
      return blocked;
    }
    const strategy = this.registry.get(parsed.draft.mode ?? '');
    if (!strategy) {
      return emptyComputation({
        calculation_status: 'unsupported_rule',
        scenario_id: parsed.draft.scenarioId,
        evidence_refs: parsed.draft.evidenceRefs,
        notes: [`模式 ${parsed.draft.mode ?? ''} 尚未注册。未实现的计费规则不能并入简化公式`],
        input_version: parsed.draft.inputVersion,
      });
    }
    return strategy.quote(parsed.draft);
  }

  private wrap(computation: PricingComputation): SkuQuoteResponse {
    return {
      ...computation,
      formula_version: FORMULA_VERSION,
      calculation_id: randomUUID(),
      publish_authorized: false,
      reused: false,
      created_at: new Date().toISOString(),
    };
  }
}
