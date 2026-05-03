"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion, type Variants } from "motion/react";

const caseItems = [
  {
    image: "/IMG_0518.JPG",
    href: "https://www.linkedin.com/posts/vivianlee-rollgrp_medixproclot-medtech-marketentry-activity-7445308208061108224-Dd9P",
    description:
      "Since our trip in January, things have been moving fast. We're seeing great traction in both the MIS (Minimally Invasive Surgery) and pet markets. Our local partners' incredible hustle.",
  },
  {
    image: "/IMG_0418.JPG",
    href: "https://www.linkedin.com/posts/vivianlee-rollgrp_i-have-met-with-more-than-10-investors-and-activity-7444006287463571456-3fk0",
    description:
      "I have met with more than 10 investors and expanded our reach into 3 different countries. One question I am constantly asked is: “How well do you know Steve Lazar?”",
  },
  {
    image: "/IMG_0517.JPG",
    href: "https://www.linkedin.com/posts/vivianlee-rollgrp_medixproclot-hemostasis-biotech-activity-7403122522767974400-WP6I",
    description:
      "Today marks a truly exciting milestone! We have officially entered the Vietnam market! This step not only solidifies our presence in another key region but also offers a valuable opportunity to connect with other leading hemostatic brands and wound care gel suppliers locally.",
  },
];

const titleContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045 } },
};

const letter: Variants = {
  hidden: { y: 80, opacity: 0, rotateX: -75 },
  visible: {
    y: 0,
    opacity: 1,
    rotateX: 0,
    transition: { type: "spring", stiffness: 260, damping: 22 },
  },
};

const subHeader: Variants = {
  hidden: { opacity: 0, x: -40 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.2 },
  },
};

const cardGrid: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.22, delayChildren: 0.5 } },
};

const cardItem: Variants = {
  hidden: { opacity: 0, y: 80, scale: 0.88, filter: "blur(12px)" },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
  },
};

const descFade: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut", delay: 0.2 },
  },
};

export default function Work() {
  const t = useTranslations("Work");
  const [expanded, setExpanded] = useState(true);
  const titleText = t("title");

  return (
    <section
      id="work"
      className="bg-primary min-h-[55vh] flex items-center justify-center py-10 md:py-12 overflow-hidden"
    >
      <motion.div
        className="w-full max-w-5xl mx-auto px-5 md:px-8 flex flex-col gap-8 md:gap-10"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-12%" }}
      >
        <motion.h2
          aria-label={titleText}
          variants={titleContainer}
          className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white tracking-[-0.04em] font-[family-name:var(--font-heading)]"
          style={{ perspective: "800px" }}
        >
          {titleText.split("").map((ch, i) => (
            <motion.span
              key={i}
              aria-hidden="true"
              variants={letter}
              className="inline-block"
            >
              {ch === " " ? " " : ch}
            </motion.span>
          ))}
        </motion.h2>

        <motion.div variants={subHeader}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between pb-3 border-b border-white/30 hover:border-white/60 transition-colors"
            aria-expanded={expanded}
            aria-controls="medix-case-items"
          >
            <h3 className="text-xl md:text-2xl font-semibold text-white font-[family-name:var(--font-heading)]">
              Medix LLC
            </h3>
            <motion.span
              aria-hidden="true"
              animate={{ rotate: expanded ? 45 : 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="text-white text-2xl leading-none"
            >
              +
            </motion.span>
          </button>

          <motion.div
            id="medix-case-items"
            variants={cardGrid}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 overflow-hidden transition-[max-height,opacity,margin] duration-500 ease-out"
            style={{
              maxHeight: expanded ? 1600 : 0,
              opacity: expanded ? 1 : 0,
              marginTop: expanded ? "1.5rem" : 0,
            }}
          >
            {caseItems.map((item, i) => (
              <motion.div
                key={i}
                variants={cardItem}
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 260, damping: 22 }}
                className="flex flex-col gap-3"
              >
                <div className="aspect-[3/4] relative overflow-hidden rounded-sm bg-white/10">
                  <Image
                    src={item.image}
                    alt={`Medix LLC ${i + 1}`}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 320px"
                    className="object-cover"
                  />
                </div>
                <motion.p
                  variants={descFade}
                  className="text-xs md:text-sm text-white/70 leading-relaxed"
                >
                  {item.description}{" "}
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white underline underline-offset-2 hover:text-white/90"
                  >
                    learn more
                  </a>
                </motion.p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
