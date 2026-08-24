import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const baseSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  date: z.string(),
  // Set when an article has been re-verified, so the page can show an
  // "Updated" stamp — the plan's counter to the stale-site signal.
  updatedDate: z.string().optional(),
  excerpt: z.string().default(''),
  featuredImage: z.string().default(''),
  categories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

const posts = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './src/content/posts',
  }),
  schema: baseSchema,
});

const blog = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './src/content/blog',
  }),
  schema: baseSchema,
});

const pages = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './src/content/pages',
  }),
  schema: baseSchema,
});

export const collections = {
  posts,
  blog,
  pages,
};
