import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Docker standalone build
  output: "standalone",

  // Prisma needs to be transpiled for serverless
  serverExternalPackages: ["@prisma/client"],

  // Optimize for Vercel
  poweredByHeader: false,
  reactStrictMode: true,

  // Allow external image domains (for OpenWA media)
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },

  // Headers for webhook security
  async headers() {
    return [
      {
        source: "/api/webhooks/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, X-Webhook-Signature" },
        ],
      },
    ];
  },
};

export default nextConfig;
