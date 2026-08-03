import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

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
          background: "linear-gradient(145deg, #020617, #0b1120 60%, #020617)",
          color: "#38bdf8",
          fontSize: 250,
          fontWeight: 800,
          letterSpacing: "-0.08em",
          fontFamily: "Inter, Arial, sans-serif",
        }}
      >
        E
      </div>
    ),
    size,
  );
}
