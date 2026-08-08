import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained standalone output for the Docker image (deploy/hetzner-setup.md).
  output: "standalone",
  experimental: {
    // Compile webpack in the main build process instead of a separate worker
    // and cap its heap: halves peak build memory on small (1-core ~2GB)
    // deploy boxes, which otherwise OOM-kill the worker in CI and on the
    // Hetzner VPS. Slower, but predictable on constrained memory.
    webpackBuildWorker: false,
    webpackMemoryOptimizations: true,
  },
};

export default nextConfig;
