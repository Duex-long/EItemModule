export const SKU_PRICING_STRATEGIES = Symbol('SKU_PRICING_STRATEGIES');
export const SKU_PRICING_OPTIONS = Symbol('SKU_PRICING_OPTIONS');
export const SKU_QUOTE_STORE = Symbol('SKU_QUOTE_STORE');

export interface SkuPricingOptions {
  requiredModes: string[];
  quoteStore: 'memory' | 'file';
  quoteStorePath: string;
}
