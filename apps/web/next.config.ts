import type { NextConfig } from "next";
import path from "path";

function normalizeApiProxyTarget(value: string | undefined): string | undefined {
  if (!value || value.startsWith("/")) return undefined;
  return value.replace(/\/api\/?$/, "").replace(/\/$/, "");
}

const apiProxyTarget = normalizeApiProxyTarget(
  process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_URL,
);

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@luka/shared"],
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${apiProxyTarget}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
