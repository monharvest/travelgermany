// Cloudflare Worker for travelgermany.info (replaced Cloudflare Pages, 2026-11).
//
// Static files in dist/ are served by the asset layer, with public/_headers and
// public/_redirects applied as they were on Pages. wrangler.jsonc sends only
// /blog and /blog/ to this script first (run_worker_first), for the job that
// was functions/blog.js:
//
// Server-side 301 for the legacy Soro query-param URLs (/blog/?post=<slug>),
// which previously only had a client-side window.location.replace in blog.astro
// — invisible to crawlers that don't run JS. Phase 0.1 of
// TRAVELGERMANY-6-MONTH-PLAN.md; done here rather than as a Cloudflare zone
// Redirect Rule so it lives with the code and deploys with the site.
//
// Anything without a well-formed ?post= falls through to the static /blog/ index.
export default {
  /** @param {Request} request @param {{ ASSETS: { fetch: (r: Request) => Promise<Response> } }} env */
  async fetch(request, env) {
    const url = new URL(request.url);
    const slug = url.searchParams.get('post');

    // Build the destination ourselves from a strict slug pattern, so a crafted
    // ?post= value can never redirect off-site.
    if (slug && /^[a-z0-9][a-z0-9-]{0,120}$/.test(slug)) {
      return Response.redirect(`${url.origin}/blog/${slug}/`, 301);
    }

    return env.ASSETS.fetch(request);
  },
};
