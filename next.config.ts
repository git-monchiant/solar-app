import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["senasolar.ngrok.app"],
  devIndicators: false,
  output: "standalone",
};

export default nextConfig;
