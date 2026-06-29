import type { NextConfig } from "next";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const apiImagePattern = apiBaseUrl
  ? (() => {
      const url = new URL(apiBaseUrl);
      return {
        hostname: url.hostname,
        pathname: "/api/images/**",
        port: url.port,
        protocol: url.protocol.replace(":", "") as "http" | "https",
      };
    })()
  : null;

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: apiImagePattern ? [apiImagePattern] : [],
  },
};

export default nextConfig;
