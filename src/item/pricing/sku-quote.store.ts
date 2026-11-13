import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname } from 'path';
import type { StoredQuote } from './sku-pricing.types';

/**
 * 报价结果端口。相同输入只保留第一条，历史记录不覆盖。
 * 非扩展点：两个实现直接实现本接口，没有共同模板方法。
 */
export interface ISkuQuoteStore {
  findByHash(inputHash: string): StoredQuote | null;
  findById(calculationId: string): StoredQuote | null;
  append(record: StoredQuote): void;
}

export class InMemorySkuQuoteStore implements ISkuQuoteStore {
  private readonly byHash = new Map<string, StoredQuote>();
  private readonly byId = new Map<string, StoredQuote>();

  findByHash(inputHash: string): StoredQuote | null {
    return this.byHash.get(inputHash) ?? null;
  }

  findById(calculationId: string): StoredQuote | null {
    return this.byId.get(calculationId) ?? null;
  }

  append(record: StoredQuote): void {
    if (this.byHash.has(record.inputHash)) {
      throw new Error(`相同输入已存在计算记录，拒绝覆盖: ${record.inputHash}`);
    }
    this.byHash.set(record.inputHash, record);
    this.byId.set(record.calculationId, record);
  }
}

export class FileSkuQuoteStore implements ISkuQuoteStore {
  private readonly byHash = new Map<string, StoredQuote>();
  private readonly byId = new Map<string, StoredQuote>();

  constructor(private readonly filePath: string) {
    if (filePath.trim() === '') {
      throw new Error('SKU 报价存储路径不能为空');
    }
    mkdirSync(dirname(filePath), { recursive: true });
    if (!existsSync(filePath)) {
      return;
    }
    const lines = readFileSync(filePath, 'utf8')
      .split('\n')
      .filter((line) => line.length > 0);
    for (const line of lines) {
      const record = JSON.parse(line) as StoredQuote;
      if (this.byHash.has(record.inputHash)) {
        throw new Error(`报价存储出现重复输入摘要，拒绝覆盖: ${record.inputHash}`);
      }
      this.byHash.set(record.inputHash, record);
      this.byId.set(record.calculationId, record);
    }
  }

  findByHash(inputHash: string): StoredQuote | null {
    return this.byHash.get(inputHash) ?? null;
  }

  findById(calculationId: string): StoredQuote | null {
    return this.byId.get(calculationId) ?? null;
  }

  append(record: StoredQuote): void {
    if (this.byHash.has(record.inputHash)) {
      throw new Error(`相同输入已存在计算记录，拒绝覆盖: ${record.inputHash}`);
    }
    appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
    this.byHash.set(record.inputHash, record);
    this.byId.set(record.calculationId, record);
  }
}
