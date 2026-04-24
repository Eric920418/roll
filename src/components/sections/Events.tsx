"use client";

import { useTranslations } from "next-intl";
import { motion, type Variants } from "motion/react";

const events = [
  {
    date: "Fri. 24 APR",
    image: null,
    title: "Title1",
    address: "Address/Address/Address/Address/Address/Address/Address",
  },
  {
    date: "Fri. 24 APR",
    image: null,
    title: "Title1",
    address: "Address/Address/Address/Address/Address/Address/Address",
  },
  {
    date: "Fri. 24 APR",
    image: null,
    title: "Title1",
    address: "Address/Address/Address/Address/Address/Address/Address",
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

const cardGrid: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.2, delayChildren: 0.45 } },
};

const cardItem: Variants = {
  hidden: {
    opacity: 0,
    y: 90,
    rotateY: -18,
    scale: 0.9,
    filter: "blur(10px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    rotateY: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.95, ease: [0.22, 1, 0.36, 1] },
  },
};

const pill: Variants = {
  hidden: { scale: 0, opacity: 0, y: -8 },
  visible: {
    scale: 1,
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 420,
      damping: 16,
      delay: 0.45,
    },
  },
};

const textRow: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut", delay: 0.55 },
  },
};

export default function Events() {
  const t = useTranslations("Events");
  const titleText = t("title");

  return (
    <section
      id="events"
      className="bg-primary flex items-center justify-center py-12 md:py-16 overflow-hidden"
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
          className="text-4xl md:text-5xl lg:text-6xl font-bold text-white font-[family-name:var(--font-heading)]"
          style={{ perspective: "800px" }}
        >
          {titleText.split("").map((ch, i) => (
            <motion.span
              key={i}
              aria-hidden="true"
              variants={letter}
              className="inline-block"
            >
              {ch === " " ? " " : ch}
            </motion.span>
          ))}
        </motion.h2>

        <motion.div
          variants={cardGrid}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
          style={{ perspective: "1200px" }}
        >
          {events.map((event, i) => (
            <motion.div
              key={i}
              variants={cardItem}
              whileHover={{ y: -8, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 240, damping: 22 }}
              className="flex flex-col gap-3"
            >
              <div className="relative aspect-square rounded-2xl overflow-hidden bg-white/20">
                <motion.span
                  variants={pill}
                  className="absolute top-4 left-4 bg-black text-white text-[11px] font-medium px-3 py-1.5 rounded-full z-10"
                >
                  {event.date}
                </motion.span>
                {event.image && (
                  <img
                    src={event.image}
                    alt={event.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
              </div>
              <motion.h3
                variants={textRow}
                className="text-white text-lg md:text-xl font-semibold font-[family-name:var(--font-heading)]"
              >
                {event.title}
              </motion.h3>
              <motion.p
                variants={textRow}
                className="text-white/55 text-[11px] leading-relaxed break-all"
              >
                {event.address}
              </motion.p>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
