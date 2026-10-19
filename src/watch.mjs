// Poll both reporters' feeds; exit when either has posts beyond the given baselines.
// Usage: node src/watch.mjs <parloffCount> <robertsCount> [maxMinutes]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { progress } from '/Users/graham/.claude/lib/progress.mjs';

const [pBase, rBase, maxMin = '45'] = process.argv.slice(2).map(Number);
const dir = new URL('.', import.meta.url).pathname;
const total = Number(maxMin);
const p = progress('hearing-watch', { total, everyN: 1 });
const count = (f) => JSON.parse(readFileSync(`${dir}data/${f}.json`, 'utf8')).length;

for (let i = 1; i <= total; i++) {
  await new Promise((r) => setTimeout(r, 60_000));
  try { execFileSync(`${dir}fetch.sh`, { stdio: 'pipe' }); } catch { p.tick(i, { error: 'fetch failed' }); continue; }
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
