import { defaultCache } from "@serwist/next/worker";
import {
  Serwist,
  CacheFirst,
  StaleWhileRevalidate,
  ExpirationPlugin,
} from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (string | { url: string; revision: string | null })[];
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    // Post media — immutable (R2 key includes a random UUID), serve from cache
    {
      matcher: /\/posts\//,
      handler: new CacheFirst({
        cacheName: "r2-post-media",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    // Avatars — serve stale, revalidate in background
    {
      matcher: /\/avatars\//,
      handler: new StaleWhileRevalidate({
        cacheName: "r2-avatars",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    // Default Next.js caching rules
    ...defaultCache,
  ],
});

serwist.addEventListeners();
