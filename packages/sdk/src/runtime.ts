export const SDK_RUNTIME = Object.freeze({
  name: '@personal-gateway/sdk',
  version: '1.0.0',
  pluginApiVersion: 1 as const,
});

export type SdkRuntime = typeof SDK_RUNTIME;
