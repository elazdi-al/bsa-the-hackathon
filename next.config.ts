import type { NextConfig } from "next";

const app = process.env.CAPACITOR === "1";

const nextConfig: NextConfig = {
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  ...(app
    ? {
        output: "export",
        // Every page and layout is .tsx, so the app/api route.ts handlers stay on the server.
        pageExtensions: ["tsx"],
        // Without the handlers, typegen omits the RouteContext they use. npm run typecheck covers them.
        typescript: { ignoreBuildErrors: true },
        env: { NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000" },
      }
    : {
        headers: async () => [
          {
            source: "/api/:path*",
            headers: [
              { key: "access-control-allow-origin", value: "capacitor://localhost" },
              { key: "access-control-allow-methods", value: "GET, POST, PATCH, DELETE, OPTIONS" },
              { key: "access-control-allow-headers", value: "content-type" },
            ],
          },
        ],
      }),
};

export default nextConfig;
