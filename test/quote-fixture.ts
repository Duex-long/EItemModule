import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function exampleRequest(): Record<string, unknown> {
  const path = join(root, 'examples', 'quote.example.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

export function withExample(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...exampleRequest(), ...overrides };
}
