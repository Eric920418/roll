"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Playbook 內文渲染：react-markdown + gfm（表格），用 components map 自帶 Tailwind 樣式，
// 不依賴 typography plugin 或全域 prose CSS。
const components: Components = {
  h1: (props) => (
    <h2
      className="mt-8 text-2xl font-extrabold tracking-[-0.02em] text-dark font-[family-name:var(--font-heading)]"
      {...props}
    />
  ),
  h2: (props) => (
    <h2
      className="mt-8 text-xl font-extrabold tracking-[-0.02em] text-dark font-[family-name:var(--font-heading)]"
      {...props}
    />
  ),
  h3: (props) => (
    <h3
      className="mt-6 text-base font-bold text-dark font-[family-name:var(--font-heading)]"
      {...props}
    />
  ),
  p: (props) => <p className="mt-3 text-sm leading-relaxed text-dark/80" {...props} />,
  ul: (props) => (
    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-dark/80" {...props} />
  ),
  ol: (props) => (
    <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-dark/80" {...props} />
  ),
  li: (props) => <li className="pl-1" {...props} />,
  strong: (props) => <strong className="font-semibold text-dark" {...props} />,
  a: (props) => (
    <a className="text-primary underline underline-offset-2" {...props} />
  ),
  hr: () => <hr className="my-6 border-dark/10" />,
  code: (props) => (
    <code className="rounded bg-dark/[0.06] px-1.5 py-0.5 text-[0.85em] text-dark" {...props} />
  ),
  table: (props) => (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: (props) => (
    <th
      className="border border-dark/10 bg-dark/[0.03] px-3 py-2 text-left font-semibold text-dark"
      {...props}
    />
  ),
  td: (props) => <td className="border border-dark/10 px-3 py-2 align-top text-dark/80" {...props} />,
  blockquote: (props) => (
    <blockquote className="mt-3 border-l-2 border-primary/40 pl-4 text-sm text-dark/70" {...props} />
  ),
};

export default function PlaybookArticle({ markdown }: { markdown: string }) {
  return (
    <div className="mt-6 max-w-3xl font-[family-name:var(--font-body)]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
