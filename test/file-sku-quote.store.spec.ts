import { existsSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileSkuQuoteStore } from '../src/item/pricing/sku-quote.store.js';
import type { SkuQuoteResponse, StoredQuote } from '../src/item/pricing/sku-pricing.types.js';

function record(id: string, hash: string): StoredQuote {
  const response = {
    formula_version: 'SKU-PRICING-R1',
    calculation_id: id,
    calculation_status: 'estimated',
    scenario_id: id,
    purchase_cost: '8.00',
    total_rate: '0.05',
    minimum_merchant_income: '9.48',
    minimum_list_price: '9.48',
    candidate_list_price: null,
    candidate_contribution_unrounded: null,
    target_met_in_this_scenario: null,
    publish_authorized: false,
    missing_fields: [],
    evidence_refs: [],
    notes: [],
    input_version: null,
    detail: null,
    reused: false,
    created_at: '2026-11-13T00:00:00.000Z',
  } as SkuQuoteResponse;
  return {
    calculationId: id,
    inputHash: hash,
    createdAt: response.created_at,
    response,
  };
}

describe('FileSkuQuoteStore', () => {
  it('rejects an empty path', () => {
    expect(() => new FileSkuQuoteStore('   ')).toThrow('SKU 报价存储路径不能为空');
  });

  it('does not open the quote file until start', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sku-quote-'));
    const path = join(directory, 'nested', 'quotes.jsonl');
    const store = new FileSkuQuoteStore(path);
    expect(existsSync(path)).toBe(false);
    expect(() => store.append(record('early', 'hash-early'))).toThrow('报价存储尚未启动');
  });

  it('appends history and reloads it without replacing the first record', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'sku-quote-'));
    const path = join(directory, 'nested', 'quotes.jsonl');
    const store = new FileSkuQuoteStore(path);
    await store.start();
    store.append(record('first', 'hash-1'));
    expect(() => store.append(record('other', 'hash-1'))).toThrow('拒绝覆盖');
    await store.stop();
    expect(() => store.findById('first')).toThrow('报价存储尚未启动');

    const reloaded = new FileSkuQuoteStore(path);
    await reloaded.start();
    expect(reloaded.findById('first')?.response.minimum_list_price).toBe('9.48');
    reloaded.append(record('second', 'hash-2'));
    await reloaded.start();

    const again = new FileSkuQuoteStore(path);
    await again.start();
    expect(again.findById('first')?.response.scenario_id).toBe('first');
    expect(again.findById('second')?.response.scenario_id).toBe('second');
    expect(again.findByHash('hash-1')?.calculationId).toBe('first');
  });
});