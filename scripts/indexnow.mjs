#!/usr/bin/env node
// Tells Bing which pages a push added, changed or removed, so it recrawls them
// within hours instead of days. Bing passes IndexNow URLs on to the other
// IndexNow engines (Yandex, Seznam, Naver …). Google doesn't use IndexNow; it
// picks changes up from the sitemap.
//
//   node scripts/indexnow.mjs --old <old-dist> --new <new-dist>   # what .github/workflows/indexnow.yml runs
//   node scripts/indexnow.mjs /some-page/ …                        # by hand, after a deploy
//   … --dry-run                                                    # list the URLs, send nothing
//
// A page counts as changed when its title, description, canonical, or the text
// and links inside <main> differ between the two builds. Inlined CSS, scripts
// and asset hashes are ignored, so a style tweak doesn't ping every page. Only
// sitemap URLs count, so noindex pages stay out; URLs that left the sitemap are
// sent too, so Bing recrawls them and sees the 404 or redirect.
//
// Bing fetches a URL as soon as it hears about it, so each URL is polled live
// until it serves the new build (or no longer answers 200, for removed pages).
// The key is the 32-hex file in public/, served at /<key>.txt to prove we own
// the host; nothing is sent until that file is live.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const HOST = 'travelgermany.info';
const ORIGIN = `https://${HOST}`;
const ENDPOINT = 'https://www.bing.com/indexnow';
const WAIT_MINUTES = 15;

const root = new URL('..', import.meta.url).pathname;

const fail = (msg) => {
  console.error(`[indexnow] FAIL: ${msg}`);
  process.exit(1);
};

const opts = { dryRun: false, old: null, new: null, paths: [] };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dry-run') opts.dryRun = true;
  else if (args[i] === '--old') opts.old = args[++i];
  else if (args[i] === '--new') opts.new = args[++i];
  else opts.paths.push(args[i]);
}

const keyFile = readdirSync(join(root, 'public')).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) fail('no public/<32-hex>.txt key file');
const key = keyFile.slice(0, -4);
const keyLocation = `${ORIGIN}/${keyFile}`;

function sitemapUrls(dist) {
  if (!dist || !existsSync(dist)) return [];
  return readdirSync(dist)
    .filter((f) => /^sitemap-\d+\.xml$/.test(f))
    .flatMap((f) => [...readFileSync(join(dist, f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)])
    .map((m) => new URL(m[1]).href);
}

function distFile(dist, url) {
  const path = decodeURIComponent(new URL(url).pathname);
  const candidates = path.endsWith('/') ? [`${path}index.html`] : [`${path}.html`, `${path}/index.html`];
  return candidates.map((p) => join(dist, p)).find((f) => existsSync(f)) ?? null;
}

function fingerprint(html) {
  const pick = (re) => html.match(re)?.[1] ?? '';
  const main = pick(/<main[^>]*>([\s\S]*?)<\/main>/) || pick(/<body[^>]*>([\s\S]*?)<\/body>/);
  const links = [...main.matchAll(/href="([^"]*)"/g)]
    .map((m) => m[1])
    .filter((h) => !h.startsWith('/_astro/') && !h.startsWith('/cdn-cgi/') && !h.startsWith('mailto:'));
  const text = main
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    // Cloudflare email obfuscation rewrites addresses in the live page only.
    .replace(/\[email(?:&#160;|\s)protected\]|[\w.+-]+@[\w-]+\.[\w.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const head = [/<title>([^<]*)<\/title>/, /<meta name="description" content="([^"]*)"/, /<link rel="canonical" href="([^"]*)"/]
    .map(pick)
    .join('\n');
  return createHash('sha1').update(`${head}\n${links.join(' ')}\n${text}`).digest('hex');
}

function pageFingerprint(dist, url) {
  const file = distFile(dist, url);
  return file ? fingerprint(readFileSync(file, 'utf8')) : null;
}

const queue = [];
if (opts.new) {
  const before = new Map(sitemapUrls(opts.old).map((u) => [u, pageFingerprint(opts.old, u)]));
  const after = new Map(sitemapUrls(opts.new).map((u) => [u, pageFingerprint(opts.new, u)]));
  if (after.size === 0) fail(`no sitemap-N.xml in ${opts.new}`);
  for (const [url, fp] of after) {
    if (!fp) console.warn(`[indexnow] skip ${url}: no page for it in the build`);
    else if (!before.has(url)) queue.push({ url, kind: 'new', fp });
    else if (before.get(url) !== fp) queue.push({ url, kind: 'changed', fp });
  }
  for (const url of before.keys()) if (!after.has(url)) queue.push({ url, kind: 'removed' });
} else {
  for (const p of opts.paths) {
    const url = new URL(p, `${ORIGIN}/`);
    if (url.host !== HOST) fail(`not a ${HOST} URL: ${p}`);
    queue.push({ url: url.href, kind: 'given' });
  }
  if (queue.length === 0) fail('usage: node scripts/indexnow.mjs [--dry-run] (--old <dist> --new <dist> | /path/ …)');
}

for (const item of queue) console.log(`${item.kind} ${item.url}`);
if (queue.length === 0) {
  console.log('[indexnow] no page changes, nothing to send');
  process.exit(0);
}
if (opts.dryRun) {
  console.log(`[indexnow] dry run: ${queue.length} URL(s), nothing sent`);
  process.exit(0);
}

async function isLive(item) {
  try {
    const res = await fetch(item.url, { redirect: 'manual', cache: 'no-store' });
    item.last = `HTTP ${res.status}`;
    if (item.kind === 'removed') return res.status !== 200;
    if (item.kind === 'given') return res.status < 500;
    if (res.status !== 200) return false;
    if (fingerprint(await res.text()) === item.fp) return true;
    item.last += ', still the old content';
    return false;
  } catch (error) {
    item.last = String(error?.cause?.code ?? error);
    return false;
  }
}

const ready = [];
let pending = queue;
const deadline = Date.now() + WAIT_MINUTES * 60_000;
while (pending.length > 0) {
  const next = [];
  for (let i = 0; i < pending.length; i += 8) {
    const batch = pending.slice(i, i + 8);
    const live = await Promise.all(batch.map(isLive));
    batch.forEach((item, j) => (live[j] ? ready : next).push(item));
  }
  pending = next;
  if (pending.length === 0 || Date.now() > deadline) break;
  await new Promise((r) => setTimeout(r, 20_000));
}
for (const item of pending) console.warn(`[indexnow] held ${item.url}: not live after ${WAIT_MINUTES} min (${item.last})`);

if (ready.length > 0) {
  const keyBody = await fetch(keyLocation, { cache: 'no-store' })
    .then((r) => (r.ok ? r.text() : ''))
    .catch(() => '');
  if (keyBody.trim() !== key) fail(`${keyLocation} is not live yet; deploy first`);

  // 10,000 URLs per request is the protocol cap.
  for (let i = 0; i < ready.length; i += 10_000) {
    const urlList = ready.slice(i, i + 10_000).map((item) => item.url);
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key, keyLocation, urlList }),
    });
    // 200 = accepted; 202 = accepted while Bing validates the key.
    if (res.status !== 200 && res.status !== 202) fail(`Bing answered HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    console.log(`[indexnow] Bing accepted ${urlList.length} URL(s) (HTTP ${res.status})`);
  }
}
if (pending.length > 0) process.exitCode = 1;
