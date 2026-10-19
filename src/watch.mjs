// Poll both reporters' feeds; exit when either has posts beyond the given baselines.
// Usage: node src/watch.mjs <parloffCount> <robertsCount> [maxMinutes]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { progress } from '/Users/graham/.claude/lib/progress.mjs';

const [pBase, rBase, maxMin = 45] = process.argv.slice(2).map(Number);
// fileURLToPath, not URL.pathname: the latter keeps "%20" for the space in "Local Files".
const dir = dirname(fileURLToPath(import.meta.url));
const total = Number(maxMin);
const p = progress('hearing-watch', { total, everyN: 1 });
const count = (f) => JSON.parse(readFileSync(join(dir, 'data', `${f}.json`), 'utf8')).length;

let failures = 0;
for (let i = 1; i <= total; i++) {
  await new Promise((r) => setTimeout(r, 60_000));
  try {
    execFileSync(join(dir, 'fetch.sh'), { stdio: 'pipe' });
    failures = 0;
  } catch (err) {
    failures += 1;
    p.tick(i, { error: `fetch failed: ${String(err.message).slice(0, 200)}` });
    // A broken fetch reports the same as "no new posts", so stop and say so.
    if (failures >= 3) {
      p.done({ reason: 'fetch failing' });
      console.log(`FETCH FAILING x${failures}: ${String(err.message).slice(0, 500)}`);
      process.exit(1);
    }
    continue;
  }
  const pc = count('parloff'), rc = count('roberts');
  p.tick(i, { parloff: pc, roberts: rc });
  if (pc > pBase || rc > rBase) {
    p.done({ parloff: pc, roberts: rc, reason: 'new posts' });
    console.log(`NEW parloff=${pc} (was ${pBase}) roberts=${rc} (was ${rBase})`);
    process.exit(0);
  }
}
p.done({ reason: 'idle timeout' });
console.log(`IDLE ${total}m, no new posts`);
