import { ConfigurationError } from './errors.js';
import { SDK_RUNTIME } from './runtime.js';
import { findService } from './services.js';
import type {
  GatewayModuleManifest,
  GatewayModuleRegistration,
  ModuleRequirements,
  PreparedModule,
  ServiceRef,
} from './types.js';
import { versionSatisfies } from './version.js';

const MANIFEST_KEYS = [
  'manifestVersion',
  'pluginApiVersion',
  'id',
  'packageName',
  'version',
  'compatibility',
  'providesServices',
  'mayRequireServices',
  'lifecycle',
  'consumesExtensions',
  'contributesExtensions',
  'stages',
  'observers',
] as const;

const MODULE_ID = /^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*$/;

export function assertModuleId(id: string): void {
  if (typeof id !== 'string' || id.length < 3 || id.length > 128 || !MODULE_ID.test(id)) {
    throw new ConfigurationError(`非法模块 id: ${String(id)}`);
  }
}

export function parseManifest(input: unknown): GatewayModuleManifest {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ConfigurationError('模块清单必须是对象');
  }
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!MANIFEST_KEYS.includes(key as (typeof MANIFEST_KEYS)[number])) {
      throw new ConfigurationError(`模块清单含有未知字段: ${key}`);
    }
  }
  for (const key of MANIFEST_KEYS) {
    if (!(key in record)) {
      throw new ConfigurationError(`模块清单缺少字段: ${key}`);
    }
  }
  if (record.manifestVersion !== 1) {
    throw new ConfigurationError(`不支持的 manifestVersion: ${String(record.manifestVersion)}`);
  }
  if (record.pluginApiVersion !== 1) {
    throw new ConfigurationError(`不支持的 pluginApiVersion: ${String(record.pluginApiVersion)}`);
  }
  assertModuleId(record.id as string);
  if (typeof record.packageName !== 'string' || record.packageName.trim() === '') {
    throw new ConfigurationError('packageName 必须是非空字符串');
  }
  if (typeof record.version !== 'string') {
    throw new ConfigurationError('version 必须是字符串');
  }
  const compatibility = record.compatibility;
  if (compatibility === null || typeof compatibility !== 'object' || Array.isArray(compatibility)) {
    throw new ConfigurationError('compatibility 必须是对象');
  }
  const compat = compatibility as Record<string, unknown>;
  for (const key of Object.keys(compat)) {
    if (key !== 'sdk' && key !== 'gateway') {
      throw new ConfigurationError(`compatibility 含有未知字段: ${key}`);
    }
  }
  if (typeof compat.sdk !== 'string' || typeof compat.gateway !== 'string') {
    throw new ConfigurationError('compatibility.sdk 和 compatibility.gateway 必须是版本范围');
  }
  if (typeof record.lifecycle !== 'boolean') {
    throw new ConfigurationError('lifecycle 必须是布尔值');
  }
  return {
    manifestVersion: 1,
    pluginApiVersion: 1,
    id: record.id as string,
    packageName: record.packageName,
    version: record.version,
    compatibility: { sdk: compat.sdk, gateway: compat.gateway },
    providesServices: readServiceRefs(record.providesServices, 'providesServices'),
    mayRequireServices: readServiceRefs(record.mayRequireServices, 'mayRequireServices'),
    lifecycle: record.lifecycle,
    consumesExtensions: readStringList(record.consumesExtensions, 'consumesExtensions'),
    contributesExtensions: readContributions(record.contributesExtensions),
    stages: readStringList(record.stages, 'stages'),
    observers: readStringList(record.observers, 'observers'),
  };
}

export function assertPackageMetadata(
  manifest: GatewayModuleManifest,
  pkg: { readonly name?: unknown; readonly version?: unknown },
): void {
  if (pkg.name !== manifest.packageName || pkg.version !== manifest.version) {
    throw new ConfigurationError(
      `清单 ${manifest.packageName}@${manifest.version} 与包元数据 ${String(pkg.name)}@${String(pkg.version)} 不一致`,
    );
  }
}

export function assertSdkIdentity(candidate: unknown): void {
  if (candidate !== SDK_RUNTIME) {
    throw new ConfigurationError('模块 SDK 运行时身份与宿主不是同一实例');
  }
}

export function validateAndFreezePrepared<TOptions>(
  manifest: GatewayModuleManifest,
  options: TOptions,
  requirements: ModuleRequirements,
): PreparedModule<TOptions> {
  parseManifest(manifest);
  const declared = new Set(manifest.mayRequireServices.map((item) => serviceIdentity(item)));
  for (const service of requirements.services) {
    if (!declared.has(serviceIdentity(service))) {
      throw new ConfigurationError(`模块 ${manifest.id} 实际依赖了未声明的服务 ${service.key}@${service.apiVersion}`);
    }
  }
  return Object.freeze({
    options: freezeData(options),
    requirements: Object.freeze({
      services: Object.freeze(requirements.services.map((item) => Object.freeze({ ...item }))),
    }),
  });
}

export function validateRegistration(
  manifest: GatewayModuleManifest,
  registration: GatewayModuleRegistration,
): GatewayModuleRegistration {
  parseManifest(manifest);
  assertSameRefs(manifest.providesServices, registration.services ?? [], 'service');
  for (const service of registration.services ?? []) {
    const catalog = findService(service.key, service.apiVersion);
    if (!catalog) {
      throw new ConfigurationError(`服务 ${service.key}@${service.apiVersion} 不在 SDK 服务目录中`);
    }
    if (service.token !== catalog.token) {
      throw new ConfigurationError(`服务 ${service.key} 必须使用 SDK 目录中的 Token`);
    }
  }
  assertSameKeys(manifest.stages, tokensToKeys(registration.stages), 'stage');
  assertSameKeys(manifest.observers, tokensToKeys(registration.observers), 'observer');
  const extensions = registration.extensions ?? [];
  const extensionKeys = extensions.map((item) => `${item.point}:${item.key}`);
  const declaredExtensions = manifest.contributesExtensions.map((item) => `${item.point}:${item.key}`);
  assertSameKeys(declaredExtensions, extensionKeys, 'extension');
  if (manifest.lifecycle && registration.lifecycle === undefined) {
    throw new ConfigurationError(`模块 ${manifest.id} 声明了生命周期，但注册结果没有 lifecycle Token`);
  }
  if (!manifest.lifecycle && registration.lifecycle !== undefined) {
    throw new ConfigurationError(`模块 ${manifest.id} 未声明生命周期，不能导出 lifecycle Token`);
  }
  return registration;
}

export function assertHostCompatibility(manifest: GatewayModuleManifest, gatewayVersion: string): void {
  if (manifest.pluginApiVersion !== SDK_RUNTIME.pluginApiVersion) {
    throw new ConfigurationError(
      `插件协议 ${manifest.pluginApiVersion} 与 SDK ${SDK_RUNTIME.pluginApiVersion} 不一致`,
    );
  }
  if (!versionSatisfies(SDK_RUNTIME.version, manifest.compatibility.sdk)) {
    throw new ConfigurationError(
      `SDK ${SDK_RUNTIME.version} 不满足模块要求的 ${manifest.compatibility.sdk}`,
    );
  }
  if (!versionSatisfies(gatewayVersion, manifest.compatibility.gateway)) {
    throw new ConfigurationError(
      `网关 ${gatewayVersion} 不满足模块要求的 ${manifest.compatibility.gateway}`,
    );
  }
}

function readServiceRefs(input: unknown, label: string): ServiceRef[] {
  if (!Array.isArray(input)) {
    throw new ConfigurationError(`${label} 必须是数组`);
  }
  return input.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new ConfigurationError(`${label}[${index}] 必须是对象`);
    }
    const record = item as Record<string, unknown>;
    if (typeof record.key !== 'string' || record.key.trim() === '' || typeof record.apiVersion !== 'number') {
      throw new ConfigurationError(`${label}[${index}] 必须包含 key 和 apiVersion`);
    }
    if (Object.keys(record).some((key) => key !== 'key' && key !== 'apiVersion')) {
      throw new ConfigurationError(`${label}[${index}] 含有未知字段`);
    }
    return { key: record.key, apiVersion: record.apiVersion };
  });
}

function readStringList(input: unknown, label: string): string[] {
  if (!Array.isArray(input) || input.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new ConfigurationError(`${label} 必须是非空字符串数组`);
  }
  return [...input];
}

function readContributions(input: unknown): { point: string; key: string }[] {
  if (!Array.isArray(input)) {
    throw new ConfigurationError('contributesExtensions 必须是数组');
  }
  return input.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new ConfigurationError(`contributesExtensions[${index}] 必须是对象`);
    }
    const record = item as Record<string, unknown>;
    if (typeof record.point !== 'string' || typeof record.key !== 'string') {
      throw new ConfigurationError(`contributesExtensions[${index}] 必须包含 point 和 key`);
    }
    return { point: record.point, key: record.key };
  });
}

function serviceIdentity(service: ServiceRef): string {
  return `${service.key}@${service.apiVersion}`;
}

function assertSameRefs(
  declared: readonly ServiceRef[],
  actual: readonly { key: string; apiVersion: number }[],
  label: string,
): void {
  const left = declared.map(serviceIdentity).sort();
  const right = actual.map(serviceIdentity).sort();
  if (left.join('|') !== right.join('|')) {
    throw new ConfigurationError(`${label} 注册结果与清单不一致`);
  }
  if (new Set(right).size !== right.length) {
    throw new ConfigurationError(`${label} 注册结果存在重复标识`);
  }
}

function assertSameKeys(declared: readonly string[], actual: readonly string[], label: string): void {
  const left = [...declared].sort();
  const right = [...actual].sort();
  if (left.join('|') !== right.join('|')) {
    throw new ConfigurationError(`${label} 注册结果与清单不一致`);
  }
  if (new Set(right).size !== right.length) {
    throw new ConfigurationError(`${label} 注册结果存在重复标识`);
  }
}

function tokensToKeys(tokens: readonly unknown[] | undefined): string[] {
  return (tokens ?? []).map((token) => {
    if (typeof token === 'string') {
      return token;
    }
    throw new ConfigurationError('stage 和 observer Token 在清单对照时必须是字符串 key');
  });
}

function freezeData<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      freezeData(item);
    }
    return Object.freeze(value) as T;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    freezeData(record[key]);
  }
  return Object.freeze(value);
}
