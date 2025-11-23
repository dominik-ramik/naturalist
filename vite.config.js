import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
    base: './',
    build: {
        outDir: 'dist',
        sourcemap: true,
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
        })
    ]
});

const skipInBuild = [
    'public/usercontent/data/checklist.json',
    'public/usercontent/images',
    'public/usercontent/maps/vu.svg',
    'public/usercontent/sounds',
    'public/usercontent/texts',
    'public/usercontent/about.md',
    'public/usercontent/online_search_icons/avh.png',
    'public/usercontent/online_search_icons/birdlife.png',
    'public/usercontent/online_search_icons/ebird.png',
    'public/usercontent/online_search_icons/harvard.png',
    'public/usercontent/online_search_icons/ipni.png',
    'public/usercontent/online_search_icons/jstor.png',
    'public/usercontent/online_search_icons/kew_plants.png',
    'public/usercontent/online_search_icons/kew.png',
    'public/usercontent/online_search_icons/london.png',
    'public/usercontent/online_search_icons/noumea.png',
    'public/usercontent/online_search_icons/nsf.png',
    'public/usercontent/online_search_icons/nybg.png',
    'public/usercontent/online_search_icons/paris.png',
    'public/usercontent/online_search_icons/pvnh.png',
    'public/usercontent/online_search_icons/recolnat.png',
    'public/usercontent/online_search_icons/smithsonian.png',
    'public/usercontent/online_search_icons/tropicos.png'
];