import type { NextConfig } from "next";

const development = process.env.NODE_ENV !== "production";
const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  serverExternalPackages: ["better-sqlite3"],
  experimental: { cpus: 1, webpackMemoryOptimizations: true },
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'${development ? " ws: wss:" : ""}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` },
      ...(!development ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
    ];
    return [
      ...["/", "/:path*"].map(source => ({ source, headers })),
      ...["/api/:path*", "/dashboard", "/analytics", "/promos", "/account", "/login", "/register", "/verify-email", "/orders/:path*", "/support/:path*", "/inbox"].map(source => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] })),
    ];
  },
};

export default nextConfig;
