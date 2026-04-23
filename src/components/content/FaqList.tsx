import type { Faq } from "@/lib/mdx";
import type { Locale } from "@/i18n/routing";

const HEADINGS: Record<Locale, string> = {
  en: "Frequently Asked Questions",
  "zh-tw": "常見問題",
};

export default function FaqList({
  faqs,
  locale,
}: {
  faqs: Faq[];
  locale: Locale;
}) {
  if (!faqs.length) return null;
  return (
    <section
      aria-labelledby="faq-heading"
      className="mt-16 border-t border-dark/10 pt-12"
    >
      <h2
        id="faq-heading"
        className="text-2xl md:text-3xl font-bold text-dark mb-8 font-[family-name:var(--font-heading)]"
      >
        {HEADINGS[locale] ?? HEADINGS.en}
      </h2>
      <div className="space-y-3">
        {faqs.map((f, i) => (
          <details
            key={i}
            className="group border border-dark/10 rounded-lg overflow-hidden"
          >
            <summary className="list-none cursor-pointer px-5 py-4 flex items-center justify-between font-semibold text-dark hover:bg-dark/[0.02]">
              <span>{f.q}</span>
              <span className="text-primary transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="px-5 pb-5 pt-1 text-dark/75 leading-relaxed">
              {f.a}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
