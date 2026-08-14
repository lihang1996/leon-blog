import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
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
          backgroundColor: "#f7f4ee",
          color: "#c34a32",
          fontSize: 22,
          fontWeight: 700,
          fontFamily: "Georgia, 'Songti SC', serif",
        }}
      >
        L
      </div>
    ),
    { ...size },
  );
}
