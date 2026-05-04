import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tesseract.js"],
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...(config.watchOptions || {}),
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/.next/**",
          "**/.claude/**",
          "**/.vercel/**",
          "**/.turbo/**",
          "**/coverage/**",
          "**/dist/**",
          "**/prisma/migrations/**",
          "**/public/orders-app/assets/**",
        ],
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
  outputFileTracingExcludes: {
    "*": [
      ".claude/**",
      "public/orders-app/assets/**",
    ],
  },
};

export default nextConfig;
