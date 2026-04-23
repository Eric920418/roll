import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import type { MDXComponents } from "mdx/types";
import Link from "next/link";

const mdxComponents: MDXComponents = {
  h1: (props) => (
    <h1
      className="text-3xl md:text-5xl font-bold text-dark mt-12 mb-6 font-[family-name:var(--font-heading)]"
      {...props}
    />
  ),
  h2: (props) => (
    <h2
      className="text-2xl md:text-3xl font-bold text-dark mt-12 mb-5 font-[family-name:var(--font-heading)]"
      {...props}
    />
  ),
  h3: (props) => (
    <h3
      className="text-xl md:text-2xl font-semibold text-dark mt-8 mb-4 font-[family-name:var(--font-heading)]"
      {...props}
    />
  ),
  p: (props) => (
    <p
      className="text-base md:text-lg text-dark/80 leading-relaxed mb-5 font-[family-name:var(--font-chinese)]"
      {...props}
    />
  ),
  ul: (props) => (
    <ul className="list-disc pl-6 mb-5 space-y-2 text-dark/80" {...props} />
  ),
  ol: (props) => (
    <ol className="list-decimal pl-6 mb-5 space-y-2 text-dark/80" {...props} />
  ),
  li: (props) => <li className="leading-relaxed" {...props} />,
  blockquote: (props) => (
    <blockquote
      className="border-l-4 border-primary bg-primary/5 pl-6 py-4 my-6 italic text-dark/80"
      {...props}
    />
  ),
  a: ({ href, ...rest }) => {
    const isInternal = href && href.startsWith("/");
    if (isInternal) {
      return (
        <Link
          href={href}
          className="text-primary underline hover:text-primary-dark"
          {...rest}
        />
      );
    }
    return (
      <a
        href={href}
        rel="noopener noreferrer"
        target="_blank"
        className="text-primary underline hover:text-primary-dark"
        {...rest}
      />
    );
  },
  code: (props) => (
    <code
      className="bg-dark/5 text-dark px-1.5 py-0.5 rounded text-sm"
      {...props}
    />
  ),
  pre: (props) => (
    <pre
      className="bg-dark/90 text-white p-5 rounded-lg overflow-x-auto text-sm my-6"
      {...props}
    />
  ),
  hr: (props) => <hr className="my-10 border-dark/10" {...props} />,
  table: (props) => (
    <div className="overflow-x-auto my-6">
      <table
        className="min-w-full border-collapse border border-dark/10"
        {...props}
      />
    </div>
  ),
  th: (props) => (
    <th
      className="border border-dark/10 bg-dark/5 px-4 py-2 text-left font-semibold"
      {...props}
    />
  ),
  td: (props) => (
    <td className="border border-dark/10 px-4 py-2 text-dark/80" {...props} />
  ),
};

export function MdxBody({ source }: { source: string }) {
  return (
    <MDXRemote
      source={source}
      components={mdxComponents}
      options={{
        mdxOptions: {
          remarkPlugins: [remarkGfm],
          rehypePlugins: [
            rehypeSlug,
            [
              rehypeAutolinkHeadings,
              { behavior: "wrap", properties: { className: ["anchor"] } },
            ],
          ],
        },
      }}
    />
  );
}
