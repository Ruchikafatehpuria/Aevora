import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loaded from node_modules at runtime instead of being bundled (they rely on Node-specific module features).
  serverExternalPackages: ["unpdf", "mammoth"],
};

export default nextConfig;
