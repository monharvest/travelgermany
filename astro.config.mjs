// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://travelgermany.info',
  integrations: [sitemap()],
  build: {
    inlineStylesheets: 'always',
  },
  // Astro 7 renders Markdown with Sätteri by default; the posts were imported
  // from WordPress and carry raw HTML, so keep the remark/rehype pipeline the
  // site was built and checked with.
  markdown: {
    processor: unified(),
  },
  // Astro 7's default ('jsx') drops spaces between inline elements.
  compressHTML: true,
});
