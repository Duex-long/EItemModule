import { existsSync, readFileSync } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Test } from '@nestjs/testing';
import { Module } from '@nestjs/common';
import {
  BaseGatewayModule,
  ConfigurationError,
  ITEM_PRICING_SERVICE,
  SDK_RUNTIME,
  assertModuleId,
  assertPackageMetadata,
  defineModuleCatalog,
  planModuleLoads,
  versionSatisfies,
} from '@personal-gateway/sdk';
import { gatewayModule, sdkRuntime } from '../src/index.js';
import { ItemGatewayModule } from '../src/item/item.gateway-module.js';
import { ItemQuoteLifecycle } from '../src/item/pricing/item-quote.lifecycle.js';
import type { GatewayHostView, ModuleRegistrationContext } from '@personal-gateway/sdk';
import { exampleRequest } from './quote-fixture.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const host: GatewayHostView = {
  gatewayVersion: '0.1.0',
  config: { modules: {} },
};

@Module({})
class EmptyConfigModule {}

function registrationContext(): ModuleRegistrationContext {
  return {
    host,
    configModule: { module: EmptyConfigModule },
    imports: [],
  };
}

describe('personal.item gateway integration', () => {
  it('re-exports the same SDK runtime object', () => {
    expect(sdkRuntime).toBe(SDK_RUNTIME);
  });

  it('does not override the gateway module template methods', () => {
    expect(Object.hasOwn(ItemGatewayModule.prototype, 'prepare')).toBe(false);
    expect(Object.hasOwn(ItemGatewayModule.prototype, 'register')).toBe(false);
    expect(Object.hasOwn(BaseGatewayModule.prototype, 'prepare')).toBe(true);
  });

  it('matches the static manifest and package metadata', () => {
    const file = JSON.parse(readFileSync(join(root, 'gateway.module.json'), 'utf8')) as unknown;
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      name: string;
      version: string;
    };
    expect(gatewayModule.manifest).toEqual(file);
    assertPackageMetadata(gatewayModule.manifest, pkg);
    expect(gatewayModule.manifest).toMatchObject({
      id: 'personal.item',
      packageName: '@personal-gateway/module-item',
      providesServices: [{ key: 'item.pricing', apiVersion: 1 }],
      lifecycle: true,
      stages: [],
      observers: [],
    });
  });

  it('freezes valid options and keeps an explicit empty mode list', () => {
    const prepared = gatewayModule.prepare({ quoteStore: 'memory', requiredModes: [] }, host);
    expect(prepared.options).toEqual({ quoteStore: 'memory', requiredModes: [] });
    expect(Object.isFrozen(prepared.options)).toBe(true);
    expect(prepared.requirements.services).toEqual([]);
    expect(() => {
      (prepared.options as { quoteStore: string }).quoteStore = 'file';
    }).toThrow(TypeError);
  });

  it('rejects unknown options, a boolean store flag, and a file store without a path', () => {
    expect(() => gatewayModule.prepare({ publish: true }, host)).toThrow(ConfigurationError);
    expect(() => gatewayModule.prepare({ quoteStore: false }, host)).toThrow(ConfigurationError);
    expect(() => gatewayModule.prepare({ quoteStore: 'file', quoteStorePath: '   ' }, host)).toThrow(
      ConfigurationError,
    );
  });

  it('rejects gateway versions outside the declared range', () => {
    expect(() => gatewayModule.prepare({}, { ...host, gatewayVersion: '0.2.0' })).toThrow(ConfigurationError);
    expect(() => gatewayModule.prepare({}, { ...host, gatewayVersion: '0.0.9' })).toThrow(ConfigurationError);
    expect(gatewayModule.prepare({}, host).options.quoteStore).toBe('memory');
    expect(versionSatisfies('1.0.0', '^1.0.0')).toBe(true);
    expect(versionSatisfies('2.0.0', '^1.0.0')).toBe(false);
    expect(versionSatisfies('0.1.0', '>=0.1.0 <0.2.0')).toBe(true);
    expect(versionSatisfies('0.2.0', '>=0.1.0 <0.2.0')).toBe(false);
  });

  it('does not create a quote file when the module is only registered', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'item-register-')), 'quotes.jsonl');
    const prepared = gatewayModule.prepare({ quoteStore: 'file', quoteStorePath: path }, host);
    gatewayModule.register(registrationContext(), prepared.options);
    expect(existsSync(path)).toBe(false);
  });

  it('prices through the SDK service token after lifecycle start', async () => {
    const prepared = gatewayModule.prepare(JSON.parse(readFileSync(join(root, 'examples', 'options.json'), 'utf8')), host);
    const registration = gatewayModule.register(registrationContext(), prepared.options);
    expect(registration.services).toEqual([{ key: 'item.pricing', apiVersion: 1, token: ITEM_PRICING_SERVICE }]);
    expect(registration.lifecycle).toBe(ItemQuoteLifecycle);

    const moduleRef = await Test.createTestingModule({
      imports: [registration.module],
    }).compile();
    const lifecycle = moduleRef.get(ItemQuoteLifecycle);
    const aborted = new AbortController();
    aborted.abort();
    await expect(lifecycle.start(aborted.signal)).rejects.toThrow('启动已取消');

    await lifecycle.start(new AbortController().signal);
    await lifecycle.start(new AbortController().signal);
    const pricing = moduleRef.get(ITEM_PRICING_SERVICE);
    expect(pricing.quote(exampleRequest())).toMatchObject({
      minimum_list_price: '9.48',
      publish_authorized: false,
      calculation_status: 'estimated',
    });
    await lifecycle.stop();
    await lifecycle.stop();
    await moduleRef.close();
  });

  it('opens a file quote store only when the lifecycle starts', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'item-file-')), 'quotes.jsonl');
    const prepared = gatewayModule.prepare({ quoteStore: 'file', quoteStorePath: path }, host);
    const registration = gatewayModule.register(registrationContext(), prepared.options);
    const moduleRef = await Test.createTestingModule({ imports: [registration.module] }).compile();
    expect(existsSync(path)).toBe(false);
    const lifecycle = moduleRef.get(ItemQuoteLifecycle);
    const pricing = moduleRef.get(ITEM_PRICING_SERVICE);
    expect(() => pricing.quote(exampleRequest())).toThrow('报价存储尚未启动');
    await lifecycle.start(new AbortController().signal);
    const quoted = pricing.quote(exampleRequest());
    expect(quoted.purchase_cost).toBe('8.00');
    expect(existsSync(path)).toBe(true);
    await lifecycle.stop();
    expect(() => pricing.quote(exampleRequest())).toThrow('报价存储尚未启动');
    await moduleRef.close();
  });

  it('does not load a disabled or unknown module while selecting the catalog', () => {
    let loads = 0;
    const catalog = defineModuleCatalog([
      {
        manifest: gatewayModule.manifest,
        load: async () => {
          loads += 1;
          return { gatewayModule, sdkRuntime };
        },
      },
    ]);
    const disabled = planModuleLoads(catalog, { 'personal.item': { enabled: false } });
    expect(loads).toBe(0);
    expect(disabled.disabledIds).toEqual(['personal.item']);
    expect(() => planModuleLoads(catalog, { 'missing.item': { enabled: false } })).toThrow('未知模块');
    expect(() => planModuleLoads(catalog, { 'personal.item': { enabled: 'yes' } })).toThrow('enabled 必须是布尔值');
    expect(() => planModuleLoads(catalog, { 'personal.item': { enabled: false, options: {} } })).toThrow('不能同时提供 options');
    const enabled = planModuleLoads(catalog, {
      'personal.item': { enabled: true, options: { quoteStore: 'memory' } },
    });
    expect(loads).toBe(0);
    expect(enabled.enabled[0].options).toEqual({ quoteStore: 'memory' });
  });

  it('rejects illegal module ids at the boundary lengths', () => {
    expect(() => assertModuleId('ab')).toThrow(ConfigurationError);
    expect(() => assertModuleId('a.b')).not.toThrow();
    expect(() => assertModuleId(`${'a'.repeat(128)}`)).not.toThrow();
    expect(() => assertModuleId(`${'a'.repeat(129)}`)).toThrow(ConfigurationError);
    expect(() => assertModuleId('Personal.item')).toThrow(ConfigurationError);
    expect(() => assertModuleId('')).toThrow(ConfigurationError);
    expect(() => assertModuleId('personal/item')).toThrow(ConfigurationError);
  });
});
