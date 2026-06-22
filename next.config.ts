import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tesseract.js"],
  // Allow the dev server (incl. HMR websocket) to be reached through tunnels /
  // LAN so the app works on a phone via cloudflared or the Mac's LAN IP.
  allowedDevOrigins: ["*.trycloudflare.com", "192.168.1.89"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // The home screen embeds /orders-app via a same-origin iframe.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), browsing-topics=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },
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
  // Neither eng.traineddata nor the tesseract.js-core WASM files are statically
  // `import`ed, so Next's tracer won't bundle them into the serverless function —
  // on Vercel that makes OCR throw `ENOENT ...tesseract-core-simd.wasm` and the
  // request hang to the 120s timeout. Force-include both for every OCR route.
  outputFileTracingIncludes: {
    "app/api/extraction/**": [
      "./eng.traineddata",
      "./node_modules/tesseract.js-core/**",
    ],
  },
};

export default nextConfig;
