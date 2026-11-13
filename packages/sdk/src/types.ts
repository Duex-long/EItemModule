import type { DynamicModule, InjectionToken, Type } from '@nestjs/common';

export interface ServiceRef {
  readonly key: string;
  readonly apiVersion: number;
}

export interface GatewayModuleManifest {
  readonly manifestVersion: 1;
  readonly pluginApiVersion: 1;
  readonly id: string;
  readonly packageName: string;
  readonly version: string;
  readonly compatibility: { readonly sdk: string; readonly gateway: string };
  readonly providesServices: readonly ServiceRef[];
  readonly mayRequireServices: readonly ServiceRef[];
  readonly lifecycle: boolean;
  readonly consumesExtensions: readonly string[];
  readonly contributesExtensions: readonly { point: string; key: string }[];
  readonly stages: readonly string[];
  readonly observers: readonly string[];
}

export interface GatewayPublicConfig {
  readonly server?: unknown;
  readonly pipeline?: unknown;
  readonly services?: unknown;
  readonly routes?: unknown;
  readonly authProfiles?: unknown;
  readonly modules?: Readonly<Record<string, unknown>>;
}

export interface GatewayHostView {
  readonly gatewayVersion: string;
  readonly config: Readonly<GatewayPublicConfig>;
}

export interface ModuleRequirements {
  readonly services: readonly ServiceRef[];
}

export interface PreparedModule<TOptions> {
  readonly options: Readonly<TOptions>;
  readonly requirements: ModuleRequirements;
}

export interface ModuleRegistrationContext {
  readonly host: GatewayHostView;
  readonly configModule: DynamicModule;
  readonly imports: readonly (Type<unknown> | DynamicModule)[];
}

export interface GatewayModuleRegistration {
  readonly module: Type<unknown> | DynamicModule;
  readonly stages?: readonly InjectionToken[];
  readonly observers?: readonly InjectionToken[];
  readonly services?: readonly { key: string; apiVersion: number; token: InjectionToken }[];
  readonly extensions?: readonly { point: string; key: string; token: InjectionToken }[];
  readonly lifecycle?: InjectionToken;
}

export interface IGatewayModuleLifecycle {
  start(signal: AbortSignal): Promise<void>;
  stop(): Promise<void>;
}

export interface IGatewayModule<TOptions> {
  readonly manifest: GatewayModuleManifest;
  prepare(rawOptions: unknown, host: GatewayHostView): PreparedModule<TOptions>;
  register(context: ModuleRegistrationContext, options: Readonly<TOptions>): GatewayModuleRegistration;
}
