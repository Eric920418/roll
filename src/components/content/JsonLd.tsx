// JSON-LD injection for schema.org structured data.
// Content is always hardcoded schema objects from our own code — no user input.
// Next.js officially recommends this pattern: https://nextjs.org/docs/app/guides/json-ld

type Props = { data: object };

export default function JsonLd({ data }: Props) {
  // Escape </script> sequences inside JSON string content to prevent accidental script tag termination.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json">{json}</script>;
}
