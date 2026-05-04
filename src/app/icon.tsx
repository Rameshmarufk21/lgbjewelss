import { ImageResponse } from "next/og";

/** Node avoids Vercel Hobby 1 MB Edge bundle limit on `/icon` (ImageResponse on Edge was ~1.06 MB). */
export const runtime = "nodejs";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#18181b",
          color: "#fbbf24",
          fontSize: 200,
          fontWeight: 700,
          letterSpacing: "-0.05em",
        }}
      >
        J
      </div>
    ),
    { ...size },
  );
}
