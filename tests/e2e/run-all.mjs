// Runs every phase test against one URL: node tests/e2e/run-all.mjs http://localhost:4173/
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] || 'http://localhost:4173/';
const only = process.argv[3];
const files = readdirSync(dir).filter((f) => /^phase.*\.mjs$/.test(f) && (!only || f.includes(only))).sort();
let failed = 0;
for (const f of files) {
  console.log(`\n===== ${f} =====`);
  const r = spawnSync(process.execPath, [join(dir, f), url], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} test file(s) failed` : '\nAll test files passed');
process.exit(failed ? 1 : 0);
