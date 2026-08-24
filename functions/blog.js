// Server-side 301 for the legacy Soro query-param URLs (/blog/?post=<slug>),
// which previously only had a client-side window.location.replace in blog.astro
// — invisible to crawlers that don't run JS. Phase 0.1 of
// TRAVELGERMANY-6-MONTH-PLAN.md; done here rather than as a Cloudflare zone
// Redirect Rule so it lives with the code and deploys with the site.
//
// Anything without a well-formed ?post= falls through to the static /blog/ index.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const slug = url.searchParams.get('post');

  // Build the destination ourselves from a strict slug pattern, so a crafted
  // ?post= value can never redirect off-site.
  if (slug && /^[a-z0-9][a-z0-9-]{0,120}$/.test(slug)) {
    return Response.redirect(`${url.origin}/blog/${slug}/`, 301);
  }

  return context.next();
}
