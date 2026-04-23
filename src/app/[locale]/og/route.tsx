import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

const BRAND_BG = "#7B1A2C";
const ACCENT = "#D4A574";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("title") ?? "ROLL ON.").slice(0, 120);
  const subtitle = (
    searchParams.get("subtitle") ??
    "Taiwan & Asia Market Entry Consulting"
  ).slice(0, 160);
  const eyebrow = (searchParams.get("eyebrow") ?? "ROLL ON.").slice(0, 40);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: BRAND_BG,
          color: "#fff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 28,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: ACCENT,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              background: ACCENT,
              marginRight: 16,
            }}
          />
          {eyebrow}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              marginBottom: 32,
              maxWidth: 960,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 400,
              lineHeight: 1.4,
              opacity: 0.8,
              maxWidth: 960,
            }}
          >
            {subtitle}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 22,
            opacity: 0.7,
          }}
        >
          <div>rollgrp.com</div>
          <div style={{ color: ACCENT }}>From Visions to Big Impacts.</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
