/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const config = { 
    // Monorepo root so the file:-linked pdf-pipeline package is traced.
    outputFileTracingRoot: path.join(__dirname, "../.."),
    transpilePackages: ["pdf-pipeline"],
    images:{
    remotePatterns: [
        {
          protocol: 'https',
          hostname: 'cdn.pirrot.de',
          port: '',
          pathname: '/storage/**',
        },
        {
          protocol: 'https',
          hostname: 'cdn.pirrot.de',
          port: '',
          pathname: '/assets/**',
        },
        {
          protocol: 'https',
          hostname: 'picsum.photos',
          port: '',
          pathname: '/id/**',
        },
        {
          protocol: 'https',
          hostname: 'picsum.photos',
          port: '',
          pathname: '/seed/**',
        },
      ],
}};

export default config;
