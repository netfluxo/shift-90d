import withSerwist from "@serwist/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

// Only wrap with Serwist in production builds (webpack).
// In dev, Next.js 16 uses Turbopack which is incompatible with @serwist/next's webpack plugin.
const config =
  process.env.NODE_ENV === "production"
    ? withSerwist({
        swSrc: "src/app/sw.ts",
        swDest: "public/sw.js",
      })(nextConfig)
    : nextConfig;

export default config;
