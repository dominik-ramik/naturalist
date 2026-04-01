import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "NaturaList : The flexible taxonomic checklist app",
  description: "The flexible taxonomic checklist app",

  // Add this vite config block:
  vite: {
    server: {
      proxy: {
        '/demo': {
          target: 'http://localhost:5500',
          changeOrigin: true,
          ws: true, // Crucial for HMR (live-reloading) to work through the proxy
          rewrite: (path) => path.replace(/^\/demo/, '')
        }
      }
    }
  },

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Examples', link: '/markdown-examples' },
      { text: 'App Demo', link: '/demo/', target: '_blank' }
    ],

    sidebar: [
      {
        text: 'Examples',
        items: [
          { text: 'Markdown Examples', link: '/markdown-examples' },
          { text: 'Runtime API Examples', link: '/api-examples' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/dominik-ramik/naturalist/' }
    ]
  }
})
