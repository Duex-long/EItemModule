import itemManifest from '@personal-gateway/module-item/manifest.json' with { type: 'json' };
import { defineModuleCatalog } from '@personal-gateway/sdk';

export const moduleCatalog = defineModuleCatalog([
  {
    manifest: itemManifest,
    load: () => import('@personal-gateway/module-item'),
  },
]);
