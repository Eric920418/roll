"use client";
import { button } from "./Templates";
export default function PrintButton({ zh }: { zh: boolean }) {
  return <button type="button" className={button + " print:hidden"} onClick={() => window.print()}>{zh ? "列印／另存 PDF" : "Print / save as PDF"}</button>;
}
