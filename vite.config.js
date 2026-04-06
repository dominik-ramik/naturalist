import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync, existsSync } from 'fs';
import serveStatic from 'serve-static';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
    base: './',
    build: {
        outDir: 'dist',
        sourcemap: false,
        rollupOptions: {

        },
    },
    define: {
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    },
    server: {
        host: true
    },
    plugins: [
        VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'serviceworker.js',
            injectManifest: {
                maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
                globPatterns: [
                    '**/*.{js,css,html}',
                    'usercontent/identity/favicon.{svg,png}',
                    'img/**/*.{svg,png}'
                ]
            },
            manifest: false // We use existing manifest.json in public/
        }),
        {
            name: 'serve-dev-public-fallback',
            // apply: 'serve' ensures this plugin ONLY runs during `npm run dev`
            // It will be completely ignored during `npm run build`
            apply: 'serve', 
            configureServer(server) {
                // Check if the directory exists so the dev server doesn't crash 
                // if a teammate pulls the repo without the dev-public folder
                if (existsSync('dev-public')) {
                    // This middleware runs automatically. If a requested file (like /usercontent/data/checklist.json) 
                    // is found in dev-public, it serves it. Otherwise, it naturally falls back to /public
                    server.middlewares.use(serveStatic('dev-public', { 
                        index: false // Prevent serving index.html from this folder
                    }));
                }
            }
        }
    ]
});