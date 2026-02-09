import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const essays = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/essays" }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    dateISO: z.string(),
    slug: z.string(),
    sourceUrl: z.string(),
    wordCount: z.number(),
    readingTime: z.number(),
  }),
});

export const collections = { essays };
