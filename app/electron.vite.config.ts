import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'))
const isCanary = version.includes('canary')

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    define: {
      'import.meta.env.VITE_IS_CANARY': JSON.stringify(isCanary),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(version)
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
