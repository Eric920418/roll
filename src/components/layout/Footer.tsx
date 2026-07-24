import { getSetting } from "@/lib/cms/content";
import FooterClient, { type ContactInfo } from "./FooterClient";

// Server wrapper：抓可編輯的聯絡資訊，再交給 client（表單）渲染
export default async function Footer({
  brand = "rollon",
}: {
  brand?: "rollon" | "nova";
}) {
  const c = await getSetting("contactInfo");
  const contact: ContactInfo = {
    phone: (c.phone as string) ?? "",
    email: (c.email as string) ?? "",
    address: (c.address as string) ?? "",
    instagram: (c.instagram as string) ?? "",
    linkedin: (c.linkedin as string) ?? "",
  };
  return <FooterClient contact={contact} brand={brand} />;
}
