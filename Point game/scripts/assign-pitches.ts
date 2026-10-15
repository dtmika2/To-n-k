// npm run assign-pitches [-- path/to/pattern.json]   (rewrites the notes in place)
import { assignPitches, withAssignedPitches } from '../src/pattern/pitches.ts';
import { PATTERN_PATH, readPattern, writePattern } from './pattern-file.ts';

const path = process.argv[2] ?? PATTERN_PATH;
const pattern = readPattern(path);
for (const line of assignPitches(pattern).report) console.log(line);
writePattern(withAssignedPitches(pattern), path);
console.log(`\nwrote ${path}`);
