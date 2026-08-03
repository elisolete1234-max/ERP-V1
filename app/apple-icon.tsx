import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(150deg, #0f172a, #0b1120)",
          color: "#38bdf8",
          fontSize: 92,
          fontWeight: 800,
          letterSpacing: "-0.08em",
          fontFamily: "Inter, Arial, sans-serif",
          borderRadius: 32,
        }}
      >
        E
      </div>
    ),
    size,
  );
}
