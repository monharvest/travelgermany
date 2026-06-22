import type { APIRoute } from 'astro';

// Build-time sitemap for the Soro-hosted /blog articles.
// Soro renders articles client-side at /blog/?post=<slug> (each self-canonical
// with its own BlogPosting schema). Those URLs aren't in the main Astro sitemap
// and Soro doesn't expose a per-site article sitemap, so we generate one here to
// help discovery. This only *lists* canonical URLs — it doesn't change how Soro
// serves or canonicalises them, so it can't conflict with the embed.

const SORO_EMBED = 'https://app.trysoro.com/api/embed/228af51f-0ec3-4c16-9e30-4a12e8dd15e1';
const SITE = 'https://travelgermany.info';

interface SoroArticle {
  slug: string;
  isoDate?: string;
}

export const GET: APIRoute = async () => {
  let articles: SoroArticle[] = [];
  try {
    const res = await fetch(SORO_EMBED);
    const js = await res.text();
    const match = js.match(/SORO_ARTICLES\s*=\s*(\[[\s\S]*?\]);/);
    if (match) {
      articles = (JSON.parse(match[1]) as SoroArticle[]).filter((a) => a && a.slug);
    }
  } catch {
    // Fail soft: emit an empty (valid) sitemap rather than breaking the build
    // if Soro is unreachable at build time.
  }

  const urls = articles
    .map((a) => {
      const loc = `${SITE}/blog/?post=${encodeURIComponent(a.slug)}`;
      const lastmod = a.isoDate ? new Date(a.isoDate).toISOString() : '';
      return `  <url>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  });
};
