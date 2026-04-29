import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '/v1': {
        target: 'http://localhost:13305',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
