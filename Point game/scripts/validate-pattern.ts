// npm run validate [-- path/to/pattern.json]
import { settings } from '../src/config/settings.ts';
import { validatePattern } from '../src/pattern/validate.ts';
import { PATTERN_PATH, readPattern } from './pattern-file.ts';

const path = process.argv[2] ?? PATTERN_PATH;
const { errors, warnings } = validatePattern(readPattern(path), settings);
for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
if (errors.length > 0) {
  console.error(`\n${path}: ${errors.length} error(s)`);
  process.exit(1);
}
console.log(`${path}: OK (${warnings.length} warning(s))`);
