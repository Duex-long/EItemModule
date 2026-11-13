import { ConfigurationError } from './errors.js';
import { parseManifest } from './validate.js';
import type { GatewayModuleManifest, IGatewayModule } from './types.js';
import type { SdkRuntime } from './runtime.js';

export interface CatalogEntry {
  readonly manifest: unknown;
  readonly load: () => Promise<{ gatewayModule: IGatewayModule<unknown>; sdkRuntime: SdkRuntime }>;
}

export interface ModuleConfigEntry {
  readonly enabled: boolean;
  readonly options?: unknown;
}

export interface PlannedModule {
  readonly id: string;
  readonly entry: CatalogEntry;
  readonly options: unknown;
}

const ENTRY_KEYS = new Set(['enabled', 'options']);

/**
 * 校验静态目录。不调用 load，也不读取模块代码。
 */
export function defineModuleCatalog(entries: readonly CatalogEntry[]): readonly CatalogEntry[] {
  const ids = new Set<string>();
  for (const entry of entries) {
    const manifest = parseManifest(entry.manifest);
    if (ids.has(manifest.id)) {
      throw new ConfigurationError(`模块目录重复登记: ${manifest.id}`);
    }
    ids.add(manifest.id);
    if (typeof entry.load !== 'function') {
      throw new ConfigurationError(`模块 ${manifest.id} 缺少 load`);
    }
  }
  return Object.freeze([...entries]);
}

/**
 * 只根据配置决定哪些已登记模块可以加载。
 * disabled、未知 id 和错误的 enabled 类型都不会调用 load。
 */
export function planModuleLoads(
  catalog: readonly CatalogEntry[],
  modulesConfig: unknown,
): { enabled: readonly PlannedModule[]; disabledIds: readonly string[] } {
  if (modulesConfig === undefined) {
    return { enabled: Object.freeze([]), disabledIds: Object.freeze([]) };
  }
  if (modulesConfig === null || typeof modulesConfig !== 'object' || Array.isArray(modulesConfig)) {
    throw new ConfigurationError('modules 配置必须是对象');
  }
  const byId = new Map<string, CatalogEntry>();
  for (const entry of catalog) {
    byId.set((entry.manifest as GatewayModuleManifest).id, entry);
  }
  const enabled: PlannedModule[] = [];
  const disabledIds: string[] = [];
  for (const [id, raw] of Object.entries(modulesConfig as Record<string, unknown>)) {
    const entry = byId.get(id);
    if (!entry) {
      throw new ConfigurationError(`未知模块 id: ${id}`);
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ConfigurationError(`模块 ${id} 的配置必须是对象`);
    }
    const record = raw as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!ENTRY_KEYS.has(key)) {
        throw new ConfigurationError(`模块 ${id} 的配置含有未知字段: ${key}`);
      }
    }
    if (typeof record.enabled !== 'boolean') {
      throw new ConfigurationError(`模块 ${id} 的 enabled 必须是布尔值`);
    }
    if (!record.enabled) {
      if ('options' in record) {
        throw new ConfigurationError(`模块 ${id} 已禁用，不能同时提供 options`);
      }
      disabledIds.push(id);
      continue;
    }
    enabled.push({
      id,
      entry,
      options: 'options' in record ? record.options : {},
    });
  }
  return { enabled: Object.freeze(enabled), disabledIds: Object.freeze(disabledIds) };
}
