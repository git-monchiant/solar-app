import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["senasolar.ngrok.app", "172.22.40.9"],
  devIndicators: false,
  output: "standalone",
};

export default nextConfig;
