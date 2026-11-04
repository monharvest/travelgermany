// Appends a 301 to dist/_redirects for every built page, from the path
// without its trailing slash, and from its /index.html form, to the canonical
// one (/category/brands and /category/brands/index.html -> /category/brands/).
//
// Why: Workers static assets make both redirects themselves (html_handling:
// "auto-trailing-slash") but with a 307, a temporary redirect, where Pages
// used a 308. _redirects runs first, so these rules keep them permanent.
// Exact rules, not a /:slug pattern, which would also catch /robots.txt.
import { readdirSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;

const rules = ['/index.html / 301'];
const walk = (dir, url) => {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name === '_astro') continue;
    const path = `${url}/${entry.name}`;
    if (existsSync(join(dir, entry.name, 'index.html'))) rules.push(`${path} ${path}/ 301`, `${path}/index.html ${path}/ 301`);
    walk(join(dir, entry.name), path);
  }
};
walk(dist, '');

appendFileSync(join(dist, '_redirects'), `\n# Trailing slash, from scripts/write-slash-redirects.mjs\n${rules.join('\n')}\n`);
console.log(`[redirects] added ${rules.length} trailing-slash rules to dist/_redirects`);
