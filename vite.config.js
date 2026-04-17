import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync, existsSync } from 'fs';
import serveStatic from 'serve-static';
import i18nSelfPlugin from './src/i18n/vite-plugin-i18n-self';

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
        i18nSelfPlugin({
            // Path to your i18n index.js, relative to the project root
            // (i.e. relative to the directory that contains vite.config.js).
            i18nEntry: 'src/i18n/index.js',
        }),
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
            manifest: false
        }),
        {
            name: 'serve-dev-public-fallback',
            apply: 'serve',
            configureServer(server) {
                if (existsSync('dev-public')) {
                    server.middlewares.use(serveStatic('dev-public', {
                        index: false
                    }));
                }
            }
        }
    ]
});