import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/tiles': {
        target: 'https://daksh-arch.github.io/river_map_detailed/static-tiles',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tiles/, ''),
        secure: false,
      },
    }
  }
})
