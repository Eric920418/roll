import { getSetting } from "@/lib/cms/content";
import { logSecurityError, publicErrorMessage } from "@/lib/security/log";
import FooterClient, { type ContactInfo } from "./FooterClient";

// Server wrapper：抓可編輯的聯絡資訊，再交給 client（表單）渲染
export default async function Footer({
  brand = "rollon",
}: {
  brand?: "rollon" | "nova";
}) {
  const result = await getSetting("contactInfo")
    .then((value) => ({ value, error: null }))
    .catch((error: unknown) => ({
      value: {} as Record<string, unknown>,
      error: publicErrorMessage(logSecurityError("cms.public.footer", error)),
    }));
  const c = result.value;
  const contact: ContactInfo = {
    email: (c.email as string) ?? "",
    address: (c.address as string) ?? "",
    instagram: (c.instagram as string) ?? "",
    linkedin: (c.linkedin as string) ?? "",
  };
  return <>
    {result.error && <p role="alert" className="px-6 py-4 text-sm">{result.error}</p>}
    <FooterClient contact={contact} brand={brand} />
  </>;
}
