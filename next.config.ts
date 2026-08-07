import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained standalone output for the Docker image (deploy/hetzner-setup.md).
  output: "standalone",
};

export default nextConfig;
