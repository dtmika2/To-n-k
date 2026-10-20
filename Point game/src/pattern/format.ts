import type { Pattern } from './types.ts';

/** pattern.json text: one point per line, so diffs of hand edits stay readable. */
export function formatPattern(pattern: Pattern): string {
  const pts = pattern.points.map((p) => `    ${JSON.stringify(p)}`).join(',\n');
  const figure = pattern.figure ? `,\n  "figure": ${JSON.stringify(pattern.figure)}` : '';
  return `{\n  "points": [\n${pts}\n  ],\n  "sequence": ${JSON.stringify(pattern.sequence)}${figure}\n}\n`;
}
