import { defineConfig } from 'vite'

export default defineConfig({
  // Toy 页面挂在 /toy/<slug>/ 下，所有产物必须是相对路径。
  base: './',
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('node_modules\\three')) {
            return 'three'
          }
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5180,
  },
})
