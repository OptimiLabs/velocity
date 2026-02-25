import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "better-sqlite3",
    "turndown",
    "ws",
    "node-pty",
    "chokidar",
  ],
};

export default nextConfig;
