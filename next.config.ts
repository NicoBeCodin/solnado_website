import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* other config options here */
  webpack(config, { isServer }) {
    // 1) Silence the "critical dependency" warning from ffjavascript/web-worker
    config.module = config.module || {};
    ;(config.module as any).exprContextCritical = false

    // 2) Prevent pino-pretty from being bundled in the browser build
    config.resolve = config.resolve || {}
    ;(config.resolve as any).fallback = {
      ...(config.resolve?.fallback || {}),
      "pino-pretty": false,
    }

    return config
  },
}

export default nextConfig
