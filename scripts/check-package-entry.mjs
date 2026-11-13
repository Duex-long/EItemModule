import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { SDK_RUNTIME } from '@personal-gateway/sdk';
import { gatewayModule, sdkRuntime } from '../dist/index.js';

if (sdkRuntime !== SDK_RUNTIME) {
  throw new Error('打包入口里的 sdkRuntime 与 @personal-gateway/sdk 不是同一对象');
}
if (gatewayModule.manifest.id !== 'personal.item') {
  throw new Error(`模块 id 不正确: ${gatewayModule.manifest.id}`);
}

const entry = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8');
if (!entry.includes("from '@personal-gateway/sdk'") && !entry.includes('from "@personal-gateway/sdk"')) {
  throw new Error('入口没有把 @personal-gateway/sdk 保持为外部依赖');
}
if (entry.includes('class BaseGatewayModule') || entry.includes('SDK 运行时身份')) {
  throw new Error('SDK 实现被打进了模块入口');
}

const packed = execSync('npm pack --json --dry-run --cache /tmp/npm-cache-eitem', { encoding: 'utf8' });
const files = JSON.parse(packed)[0].files.map((file) => file.path);
const required = [
  'dist/index.js',
  'dist/index.d.ts',
  'gateway.module.json',
  'config.schema.json',
  'examples/options.json',
];
for (const path of required) {
  if (!files.includes(path)) {
    throw new Error(`打包清单缺少 ${path}`);
  }
}
const forbidden = files.filter((path) => path.startsWith('src/') || path.startsWith('packages/') || path.includes('node_modules'));
if (forbidden.length > 0) {
  throw new Error(`打包清单含有不应发布的文件: ${forbidden.join(', ')}`);
}

process.stdout.write(`package entry ok, ${files.length} files\n`);
