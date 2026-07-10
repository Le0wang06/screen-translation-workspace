import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  transpilePackages: ["tldraw"],
};

export default nextConfig;
