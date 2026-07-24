"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import NovaLogo from "@/components/brand/NovaLogo";
import ScrollReveal from "@/components/ui/ScrollReveal";

export type ContactInfo = {
  phone: string;
  email: string;
  address: string;
  instagram: string;
  linkedin: string;
};

export default function FooterClient({
  contact,
  brand = "rollon",
}: {
  contact: ContactInfo;
  brand?: "rollon" | "nova";
}) {
  const t = useTranslations("Footer");
  const locale = useLocale();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, company, locale }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("error"));
      setStatus("ok");
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : t("error"));
    }
  }

  return (
    <footer
      id="contact"
      data-brand={brand}
      className={`min-h-[50vh] overflow-hidden text-white flex items-end justify-center ${
        brand === "nova" ? "bg-primary" : "bg-[#2b1326]"
      }`}
    >
      <div className="w-full max-w-5xl mx-auto px-5 md:px-8 flex flex-col pt-12 ">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 md:gap-24">
          {/* Left: Brand Info */}
          <ScrollReveal direction="left" className="h-full">
            <div className="h-full flex flex-col justify-between gap-8">
              <div>
                <div className="mb-6">
                  {brand === "nova" ? (
                    <div>
                      <NovaLogo
                        variant="white"
                        className="h-auto w-[220px] md:w-[260px]"
                        sizes="(min-width: 768px) 260px, 220px"
                      />
                      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/40">
                        by ROLL ON
                      </p>
                    </div>
                  ) : (
                    <Image
                      src="/horizontal.png"
                      alt="ROLL ON."
                      width={240}
                      height={60}
                      className="h-10 md:h-14 w-auto"
                    />
                  )}
                </div>
                <div className="space-y-2 text-white/40 text-sm">
                  {contact.phone && <p>{contact.phone}</p>}
                  {contact.email && <p>{contact.email}</p>}
                  {contact.address && <p>{contact.address}</p>}
                </div>
              </div>
              <div className="flex items-center gap-4">
                {contact.instagram && (
                  <a
                    href={contact.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram"
                    className="opacity-70 hover:opacity-100 transition-opacity"
                  >
                    <Image
                      src="/IG.png"
                      alt="Instagram"
                      width={28}
                      height={28}
                      className="w-7 h-7 object-contain"
                    />
                  </a>
                )}
                {contact.linkedin && (
                  <a
                    href={contact.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="LinkedIn"
                    className="opacity-70 hover:opacity-100 transition-opacity"
                  >
                    <Image
                      src="/Linkedin.png"
                      alt="LinkedIn"
                      width={28}
                      height={28}
                      className="w-7 h-7 object-contain"
                    />
                  </a>
                )}
              </div>
            </div>
          </ScrollReveal>

          {/* Right: Contact Form */}
          <ScrollReveal direction="right">
            <div>
              <h3 className="text-xs uppercase tracking-[0.3em] text-white/50 mb-10 font-[family-name:var(--font-heading)]">
                {t("contactUs")}
              </h3>
              <form className="space-y-8" onSubmit={handleSubmit}>
                <div className="group relative">
                  <input
                    type="text"
                    placeholder={t("name")}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-transparent border-b border-white/20 pb-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/80 transition-all duration-500 font-[family-name:var(--font-heading)]"
                  />
                  <div className="absolute bottom-0 left-0 h-px w-0 bg-white group-focus-within:w-full transition-all duration-500" />
                </div>
                <div className="group relative">
                  <input
                    type="email"
                    placeholder={t("email")}
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-transparent border-b border-white/20 pb-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/80 transition-all duration-500 font-[family-name:var(--font-heading)]"
                  />
                  <div className="absolute bottom-0 left-0 h-px w-0 bg-white group-focus-within:w-full transition-all duration-500" />
                </div>
                <div className="group relative">
                  <textarea
                    placeholder={t("message")}
                    rows={3}
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full bg-transparent border-b border-white/20 pb-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/80 transition-all duration-500 resize-none font-[family-name:var(--font-heading)]"
                  />
                  <div className="absolute bottom-0 left-0 h-px w-0 bg-white group-focus-within:w-full transition-all duration-500" />
                </div>

                {/* honeypot：視覺隱藏，給機器人填 */}
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="absolute left-[-9999px] w-px h-px opacity-0"
                />

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={status === "sending"}
                    className="group/btn relative overflow-hidden border border-white/30 text-white text-xs uppercase tracking-[0.25em] py-4 px-10 font-[family-name:var(--font-heading)] transition-all duration-500 hover:border-white/60 hover:tracking-[0.35em] disabled:opacity-50"
                  >
                    <span
                      className={`relative z-10 transition-colors duration-500 ${
                        brand === "nova"
                          ? "group-hover/btn:text-primary"
                          : "group-hover/btn:text-[#2b1326]"
                      }`}
                    >
                      {status === "sending" ? t("sending") : t("send")}
                    </span>
                    <div className="absolute inset-0 bg-white translate-y-full group-hover/btn:translate-y-0 transition-transform duration-500 ease-out" />
                  </button>
                </div>

                {status === "ok" && (
                  <p className="text-sm text-green-400">{t("success")}</p>
                )}
                {status === "error" && (
                  <p className="text-sm text-red-400 whitespace-pre-wrap">{errorMsg}</p>
                )}
              </form>
            </div>
          </ScrollReveal>
        </div>

        {/* Copyright */}
        <div className="mt-8 pt-6 md:mt-16 md:pt-8 border-t border-white/10 text-center text-white/40 text-sm">
          <p>{t("copyright")}</p>
        </div>
      </div>
    </footer>
  );
}
