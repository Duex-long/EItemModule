export { SDK_RUNTIME as sdkRuntime } from '@personal-gateway/sdk';
import { ItemGatewayModule } from './item/item.gateway-module.js';

export const gatewayModule = new ItemGatewayModule();
