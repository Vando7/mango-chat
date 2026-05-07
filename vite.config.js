import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: true,
    proxy: {
      '/v1': {
        target: 'http://172.27.112.1:1234',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
