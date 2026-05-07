import { defineConfig } from 'vite'
import { mcpPlugin } from './vite-plugin-mcp.js'

export default defineConfig({
  plugins: [mcpPlugin()],
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
