import { ImageResponse } from "next/og";
import { siteName } from "@/lib/env";

/**
 * Generated default Open Graph image (architecture §15). Served at
 * /opengraph-image and used as the fallback share image by buildMetadata.
 * The palette mirrors the UI tokens (paper-50 / ink-900 / stone-700).
 */
export const alt = siteName;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          backgroundColor: "#f7f4ee",
          color: "#171717",
          padding: "72px 84px",
          fontFamily: "Georgia, 'Songti SC', serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 84, fontWeight: 700, lineHeight: 1.1 }}>
          {siteName}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            height: 8,
            width: 120,
            backgroundColor: "#c34a32",
          }}
        />
        <div style={{ display: "flex", marginTop: 28, fontSize: 34, color: "#6f6a61" }}>
          Next.js · TypeScript · PostgreSQL
        </div>
      </div>
    ),
    { ...size },
  );
}
