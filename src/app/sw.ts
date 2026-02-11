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
    // Post media — immutable (filename has timestamp), serve from cache
    {
      matcher: /\/storage\/v1\/object\/public\/posts\//,
      handler: new CacheFirst({
        cacheName: "supabase-post-media",
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
      matcher: /\/storage\/v1\/object\/public\/avatars\//,
      handler: new StaleWhileRevalidate({
        cacheName: "supabase-avatars",
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
