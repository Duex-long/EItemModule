import {
  BaseGatewayModule,
  ConfigurationError,
  ITEM_PRICING_SERVICE,
  parseManifest,
  type GatewayModuleManifest,
  type GatewayModuleRegistration,
  type ModuleRegistrationContext,
  type ModuleRequirements,
} from '@personal-gateway/sdk';
import { ItemModule } from './item.module.js';
import { ItemQuoteLifecycle } from './pricing/item-quote.lifecycle.js';

export interface ItemGatewayOptions {
  readonly quoteStore: 'memory' | 'file';
  readonly quoteStorePath?: string;
  readonly requiredModes: readonly string[];
}

const OPTION_KEYS = new Set(['quoteStore', 'quoteStorePath', 'requiredModes']);
const DEFAULT_MODE = 'same_base_fixed_coupon';

const ITEM_MANIFEST: GatewayModuleManifest = {
  manifestVersion: 1,
  pluginApiVersion: 1,
  id: 'personal.item',
  packageName: '@personal-gateway/module-item',
  version: '1.0.0',
  compatibility: { sdk: '^1.0.0', gateway: '>=0.1.0 <0.2.0' },
  providesServices: [{ key: 'item.pricing', apiVersion: 1 }],
  mayRequireServices: [],
  lifecycle: true,
  consumesExtensions: [],
  contributesExtensions: [],
  stages: [],
  observers: [],
};

/**
 * 功能：把商品定价模块装配进网关进程。
 * 所属模块：ItemModule。
 * 实现接口：IGatewayModule<ItemGatewayOptions>（通过基类继承）。
 * 直接基类：BaseGatewayModule<ItemGatewayOptions>。
 * 注册标识：personal.item。
 * 覆盖成员：manifest、validateOptions、requirements、createRegistration。
 * 禁止覆盖：prepare、register。
 * 内部模块：ItemModule。本类不代替 SkuComputedPricingStrategy。
 * @see docs/extensions/item-gateway-module.md
 */
export class ItemGatewayModule extends BaseGatewayModule<ItemGatewayOptions> {
  override readonly manifest = parseManifest(ITEM_MANIFEST);

  protected override validateOptions(input: unknown): ItemGatewayOptions {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new ConfigurationError('personal.item options 必须是对象');
    }
    const record = input as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!OPTION_KEYS.has(key)) {
        throw new ConfigurationError(`未知 options 字段: ${key}`);
      }
    }
    const quoteStore = readQuoteStore(record);
    const quoteStorePath = readOptionalPath(record);
    if (quoteStore === 'file' && quoteStorePath === undefined) {
      throw new ConfigurationError('quoteStore 为 file 时必须提供 quoteStorePath');
    }
    return {
      quoteStore,
      ...(quoteStorePath === undefined ? {} : { quoteStorePath }),
      requiredModes: readRequiredModes(record),
    };
  }

  protected override requirements(): ModuleRequirements {
    return { services: [] };
  }

  protected override createRegistration(
    context: ModuleRegistrationContext,
    options: Readonly<ItemGatewayOptions>,
  ): GatewayModuleRegistration {
    if (context.imports.length > 0) {
      throw new ConfigurationError('personal.item 不消费其他模块，context.imports 必须为空');
    }
    return {
      module: ItemModule.register({
        quoteStore: options.quoteStore,
        quoteStorePath: options.quoteStorePath,
        requiredModes: [...options.requiredModes],
      }),
      services: [{ key: 'item.pricing', apiVersion: 1, token: ITEM_PRICING_SERVICE }],
      lifecycle: ItemQuoteLifecycle,
    };
  }
}

function readQuoteStore(record: Record<string, unknown>): 'memory' | 'file' {
  if (!('quoteStore' in record)) {
    return 'memory';
  }
  if (record.quoteStore !== 'memory' && record.quoteStore !== 'file') {
    throw new ConfigurationError('quoteStore 只能是 memory 或 file');
  }
  return record.quoteStore;
}

function readOptionalPath(record: Record<string, unknown>): string | undefined {
  if (!('quoteStorePath' in record)) {
    return undefined;
  }
  if (typeof record.quoteStorePath !== 'string' || record.quoteStorePath.trim() === '') {
    throw new ConfigurationError('quoteStorePath 必须是非空字符串');
  }
  return record.quoteStorePath;
}

function readRequiredModes(record: Record<string, unknown>): readonly string[] {
  if (!('requiredModes' in record)) {
    return [DEFAULT_MODE];
  }
  const value = record.requiredModes;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new ConfigurationError('requiredModes 必须是由非空字符串组成的数组');
  }
  if (new Set(value).size !== value.length) {
    throw new ConfigurationError('requiredModes 不能重复');
  }
  return [...value];
}