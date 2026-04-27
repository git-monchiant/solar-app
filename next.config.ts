import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["senasolar.ngrok.app"],
  devIndicators: false,
  // Emits `.next/standalone` with only runtime files so production Docker image stays small.
  output: "standalone",
  // Expose package version to client bundles so Header can show build info.
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
};

export default nextConfig;
