import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Gumroad-hosted product cover images
      { protocol: "https", hostname: "public-files.gumroad.com" },
    ],
  },
};

export default nextConfig;
