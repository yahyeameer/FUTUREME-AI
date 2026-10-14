import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Routes from the first UI, kept working for old links and the demo script.
  async redirects() {
    return [
      { source: "/chat", destination: "/future-self", permanent: false },
      { source: "/plan", destination: "/roadmap", permanent: false },
      { source: "/future", destination: "/reflection", permanent: false },
    ];
  },
};

export default nextConfig;
