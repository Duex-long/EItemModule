import { readFileSync } from 'fs';
import { join } from 'path';

export function exampleRequest(): Record<string, unknown> {
  const path = join(__dirname, '..', 'examples', 'quote.example.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

export function withExample(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...exampleRequest(), ...overrides };
}
