/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import "./src/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import("next").NextConfig} */
const config = {
  transpilePackages: ["pdf-pipeline"],
  turbopack: {
    // Monorepo root so the workspace-linked pdf-pipeline package resolves.
    root: path.join(__dirname, "../.."),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.pirrot.de",
        port: "",
        pathname: "/storage/**",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
        port: "",
        pathname: "/id/**",
      },
    ],
  },
};

export default config;
