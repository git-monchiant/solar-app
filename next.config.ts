import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["senasolar.ngrok.app"],
  devIndicators: false,
  // Emits `.next/standalone` with only runtime files so production Docker image stays small.
  output: "standalone",
};

export default nextConfig;
