import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const baseSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  date: z.string(),
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

const pages = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './src/content/pages',
  }),
  schema: baseSchema,
});

export const collections = {
  posts,
  pages,
};
