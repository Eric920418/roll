import { setRequestLocale } from "next-intl/server";
import RollMap from "@/components/sections/RollMap";
import TaiwanMap from "@/components/sections/TaiwanMap";
import Services from "@/components/sections/Services";
import Work from "@/components/sections/Work";
import Clients from "@/components/sections/Clients";
import GoldenTicket from "@/components/sections/GoldenTicket";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main >
      <Navbar />
      <RollMap />
      <TaiwanMap />
      <Services />
      <Work />
      <Clients />
      <GoldenTicket />
      <Footer />
    </main>
  );
}
