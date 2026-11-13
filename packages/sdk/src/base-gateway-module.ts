import { assertHostCompatibility, validateAndFreezePrepared, validateRegistration } from './validate.js';
import type {
  GatewayHostView,
  GatewayModuleManifest,
  GatewayModuleRegistration,
  IGatewayModule,
  ModuleRegistrationContext,
  ModuleRequirements,
  PreparedModule,
} from './types.js';

/**
 * 功能：模块接入协议的模板。校验 options、冻结配置，并核对注册结果与清单。
 * 直接实现：IGatewayModule。
 * 禁止覆盖：prepare、register。
 * 子类实现：manifest、validateOptions、requirements、createRegistration。
 */
export abstract class BaseGatewayModule<TOptions> implements IGatewayModule<TOptions> {
  abstract readonly manifest: GatewayModuleManifest;

  prepare(rawOptions: unknown, host: GatewayHostView): PreparedModule<TOptions> {
    assertHostCompatibility(this.manifest, host.gatewayVersion);
    const options = this.validateOptions(rawOptions);
    const requirements = this.requirements(options, host);
    return validateAndFreezePrepared(this.manifest, options, requirements);
  }

  register(context: ModuleRegistrationContext, options: Readonly<TOptions>): GatewayModuleRegistration {
    return validateRegistration(this.manifest, this.createRegistration(context, options));
  }

  protected abstract validateOptions(input: unknown): TOptions;

  protected abstract requirements(options: Readonly<TOptions>, host: GatewayHostView): ModuleRequirements;

  protected abstract createRegistration(
    context: ModuleRegistrationContext,
    options: Readonly<TOptions>,
  ): GatewayModuleRegistration;
}
