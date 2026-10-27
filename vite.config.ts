import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['marca/*.svg'],
      manifest: {
        name: 'Investindo!',
        short_name: 'Investindo!',
        description: 'Patrimônio se constrói todo mês.',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#F4F5F1',
        theme_color: '#0A2E22',
        icons: [
          { src: '/marca/icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/marca/icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/marca/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'fontes', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  test: { include: ['src/**/*.test.ts', 'supabase/functions/_shared/**/*.test.ts'] },
});
