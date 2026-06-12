// LLM 生成的長文是純 markdown（非 MDX），用 react-markdown 渲染（不解譯 JSX/raw HTML，對任意 LLM 內容安全）。
// 注意：roll 既有的 @/lib/render-mdx 是 MDX(MDXRemote)，用於可信的自家 MDX；此檔專供 LLM 內容，兩者刻意分開。
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import type { Components } from "react-markdown";

const components: Components = {
  h2: (props) => (
    <h2 className="mt-10 mb-4 font-[family-name:var(--font-heading)] text-2xl font-bold text-navy" {...props} />
  ),
  h3: (props) => (
    <h3 className="mt-8 mb-3 font-[family-name:var(--font-heading)] text-xl font-semibold text-navy" {...props} />
  ),
  p: (props) => <p className="mb-5 leading-relaxed text-ink/85" {...props} />,
  ul: (props) => <ul className="mb-5 list-disc space-y-2 pl-6 text-ink/85" {...props} />,
  ol: (props) => <ol className="mb-5 list-decimal space-y-2 pl-6 text-ink/85" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  strong: (props) => <strong className="font-semibold text-navy" {...props} />,
  blockquote: (props) => (
    <blockquote className="my-6 border-l-4 border-gold bg-gold/5 px-5 py-3 text-ink/80" {...props} />
  ),
  a: ({ href, ...rest }) => (
    <a
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      className="text-navy-light underline decoration-gold/60 underline-offset-2 hover:text-navy"
      {...rest}
    />
  ),
  code: (props) => (
    <code className="rounded bg-navy/5 px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-sm text-navy" {...props} />
  ),
  hr: (props) => <hr className="my-10 border-line" {...props} />,
  table: (props) => (
    <div className="my-6 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-navy text-left text-white" {...props} />,
  th: (props) => <th className="px-4 py-2 font-semibold" {...props} />,
  td: (props) => <td className="border-b border-line px-4 py-2 text-ink/85" {...props} />,
};

export function ReportMarkdown({ source }: { source: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[
        rehypeSlug,
        [rehypeAutolinkHeadings, { behavior: "wrap", properties: { className: ["anchor"] } }],
      ]}
      components={components}
    >
      {source}
    </Markdown>
  );
}
