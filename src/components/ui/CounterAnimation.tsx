"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap-register";

type Props = {
  end: number;
  suffix?: string;
  duration?: number;
  className?: string;
  start?: boolean;
};

export default function CounterAnimation({
  end,
  suffix = "%",
  duration = 2,
  className = "",
  start,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!ref.current || hasAnimated.current) return;

    // Manual trigger mode: wait for start prop
    if (start !== undefined) {
      if (!start) return;
      hasAnimated.current = true;
      const obj = { val: 0 };
      gsap.to(obj, {
        val: end,
        duration,
        ease: "power2.out",
        onUpdate: () => setValue(Math.round(obj.val)),
      });
      return;
    }

    // Auto mode: use ScrollTrigger
    const obj = { val: 0 };

    const trigger = ScrollTrigger.create({
      trigger: ref.current,
      start: "top 85%",
      once: true,
      onEnter: () => {
        hasAnimated.current = true;
        gsap.to(obj, {
          val: end,
          duration,
          ease: "power2.out",
          onUpdate: () => setValue(Math.round(obj.val)),
        });
      },
    });

    return () => {
      trigger.kill();
    };
  }, [end, duration, start]);

  return (
    <span ref={ref} className={`${className} relative inline-block`}>
      <span className="invisible" aria-hidden="true">{end.toLocaleString()}{suffix}</span>
      <span className="absolute inset-0 text-center">{value.toLocaleString()}{suffix}</span>
    </span>
  );
}
