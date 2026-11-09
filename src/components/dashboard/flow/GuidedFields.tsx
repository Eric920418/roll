"use client";
import { Children, Fragment, isValidElement, useRef, useState, type ReactNode } from "react";

function questions(children: ReactNode, prefix = ""): Array<{ id: string; node: ReactNode }> {
  return Children.toArray(children).flatMap((child, index) => {
    const id = prefix + (isValidElement(child) && child.key != null ? String(child.key) : String(index));
    return isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment ? questions(child.props.children, id + "/") : [{ id, node: child }];
  });
}
export default function GuidedFields({ children, guided, locale }: { children: ReactNode; guided: boolean; locale: string }) {
  const items = questions(children), [selected, setSelected] = useState<string | null>(null), heading = useRef<HTMLParagraphElement>(null);
  const current = Math.max(0, items.findIndex(item => item.id === selected));
  const zh = locale === "zh-tw";
  if (!guided || items.length < 2) return <>{children}</>;
  function move(index: number) { setSelected(items[index].id); requestAnimationFrame(() => heading.current?.focus()); }
  return <div className="min-w-0 space-y-4" data-guided-fields>
    <p ref={heading} tabIndex={-1} className="text-sm font-semibold focus-visible:outline-2" aria-live="polite">{zh ? "逐題整理" : "Guided work"} {current + 1} / {items.length}</p>
    {items.map((item, index) => <div key={item.id} hidden={index !== current} className="min-w-0 space-y-3">{item.node}</div>)}
    <div className="flex flex-wrap justify-between gap-3">
      <button type="button" disabled={current === 0} onClick={() => move(current - 1)} className="min-h-11 rounded-xl border px-4 py-2 text-sm disabled:opacity-45">{zh ? "上一題" : "Back"}</button>
      <button type="button" disabled={current === items.length - 1} onClick={() => move(current + 1)} className="min-h-11 rounded-xl border px-4 py-2 text-sm disabled:opacity-45">{zh ? "下一題" : "Next"}</button>
    </div>
  </div>;
}
