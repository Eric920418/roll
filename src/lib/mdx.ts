import { readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import type { Locale } from "@/i18n/routing";
import type { ContentType } from "./routes";

const FaqSchema = z.object({
  q: z.string().min(1),
  a: z.string().min(1),
});

const FrontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(50).max(200),
  slug: z.string().min(1),
  targetQuery: z.string().min(1),
  publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  author: z.string().default("ROLL ON. Team"),
  type: z.enum(["insight", "case", "service", "country"]),
  faqs: z.array(FaqSchema).optional(),
  heroImage: z.string().optional(),
  ctaLabel: z.string().optional(),
});

export type Frontmatter = z.infer<typeof FrontmatterSchema>;
export type Faq = z.infer<typeof FaqSchema>;

export type MdxContent = {
  frontmatter: Frontmatter;
  body: string;
};

const CONTENT_ROOT = path.join(process.cwd(), "content");

function contentDirForType(type: ContentType): string {
  switch (type) {
    case "insight":
      return "insights";
    case "case":
      return "cases";
    case "service":
      return "services";
    case "country":
      return "from";
  }
}

function fileCandidates(type: ContentType, slug: string, locale: Locale): string[] {
  const dir = contentDirForType(type);
  return [
    path.join(CONTENT_ROOT, dir, `${slug}.${locale}.mdx`),
    path.join(CONTENT_ROOT, dir, `${slug}.en.mdx`),
  ];
}

export async function loadContent(
  type: ContentType,
  slug: string,
  locale: Locale,
): Promise<MdxContent> {
  const candidates = fileCandidates(type, slug, locale);
  let raw: string | null = null;
  let triedPaths: string[] = [];

  for (const file of candidates) {
    triedPaths.push(file);
    try {
      raw = await readFile(file, "utf8");
      break;
    } catch {
      // try next candidate
    }
  }

  if (raw === null) {
    throw new ContentNotFoundError(type, slug, locale, triedPaths);
  }

  const parsed = matter(raw);
  const fm = FrontmatterSchema.safeParse(parsed.data);
  if (!fm.success) {
    throw new FrontmatterValidationError(type, slug, locale, fm.error);
  }

  return { frontmatter: fm.data, body: parsed.content };
}

export class ContentNotFoundError extends Error {
  constructor(
    public type: ContentType,
    public slug: string,
    public locale: Locale,
    public triedPaths: string[],
  ) {
    super(
      `Content not found for type="${type}" slug="${slug}" locale="${locale}". Tried:\n${triedPaths.join("\n")}`,
    );
    this.name = "ContentNotFoundError";
  }
}

export class FrontmatterValidationError extends Error {
  constructor(
    public type: ContentType,
    public slug: string,
    public locale: Locale,
    public zodError: z.ZodError,
  ) {
    const issues = zodError.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    super(
      `Invalid frontmatter in ${type}/${slug}.${locale}.mdx:\n${issues}`,
    );
    this.name = "FrontmatterValidationError";
  }
}
