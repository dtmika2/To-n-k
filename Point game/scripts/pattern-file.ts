import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatPattern } from '../src/pattern/format.ts';
import type { Pattern } from '../src/pattern/types.ts';

export const PATTERN_PATH = fileURLToPath(new URL('../src/config/pattern.json', import.meta.url));

export function readPattern(path = PATTERN_PATH): Pattern {
  return JSON.parse(readFileSync(path, 'utf8')) as Pattern;
}

export function writePattern(pattern: Pattern, path = PATTERN_PATH): void {
  writeFileSync(path, formatPattern(pattern));
}
