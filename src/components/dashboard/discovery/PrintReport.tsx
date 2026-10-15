"use client";
export default function PrintReport({ label }: { label: string }) { return <button type="button" onClick={() => window.print()} className="min-h-11 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 print:hidden">{label}</button>; }
