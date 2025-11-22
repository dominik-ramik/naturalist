import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
    base: './',
    build: {
        outDir: 'dist',
    },
    define: {
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
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
        })
    ]
});

