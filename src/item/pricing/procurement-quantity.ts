import { Decimal, isPositive } from './decimal-money';
import type { ProcurementLineDraft } from './sku-pricing.types';

export interface ProcurementQuantityOk {
  ok: true;
  quantity: Decimal;
  lineGoods: Decimal;
}

export interface ProcurementQuantityFail {
  ok: false;
  reason: string;
}

export type ProcurementQuantityResult = ProcurementQuantityOk | ProcurementQuantityFail;

/**
 * q = 消费者购买份数 × 每销售份实物数 ÷ 每采购单位实物数。
 * 不满足起订量或步长时失败，禁止向上取整凑单。
 * 起订量本身不是采购倍数。
 */
export function evaluateProcurementLine(
  salesQuantity: Decimal,
  line: ProcurementLineDraft,
): ProcurementQuantityResult {
  if (!isPositive(line.unitsPerSale) || !isPositive(line.unitsPerPurchase)) {
    return { ok: false, reason: `${line.lineId} 的单位数量必须大于 0` };
  }
  if (line.unitPrice.lt(0)) {
    return { ok: false, reason: `${line.lineId} 的单价不能为负` };
  }
  const quantity = salesQuantity.mul(line.unitsPerSale).div(line.unitsPerPurchase);
  if (!quantity.isFinite() || quantity.lte(0)) {
    return { ok: false, reason: `${line.lineId} 的采购数量必须大于 0` };
  }
  if (!line.allowFractionalUnit && !quantity.isInteger()) {
    return {
      ok: false,
      reason: `${line.lineId} 的采购数量 ${quantity.toString()} 不是允许的整数采购单位，不能向上取整凑单`,
    };
  }
  if (line.moq) {
    if (line.moq.lte(0)) {
      return { ok: false, reason: `${line.lineId} 的起订量必须大于 0` };
    }
    if (quantity.lt(line.moq)) {
      return {
        ok: false,
        reason: `${line.lineId} 的采购数量 ${quantity.toString()} 低于起订量 ${line.moq.toString()}，不能自动加量`,
      };
    }
  }
  if (line.step) {
    if (line.step.lte(0)) {
      return { ok: false, reason: `${line.lineId} 的增购步长必须大于 0` };
    }
    const base = line.moq ?? new Decimal(0);
    const offset = quantity.minus(base);
    if (offset.lt(0) || !offset.mod(line.step).isZero()) {
      return {
        ok: false,
        reason: `${line.lineId} 的采购数量 ${quantity.toString()} 不满足增购步长 ${line.step.toString()}`,
      };
    }
  }
  return {
    ok: true,
    quantity,
    lineGoods: quantity.mul(line.unitPrice),
  };
}
