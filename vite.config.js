import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/iron-workout/',  // название твоего репозитория
  plugins: [react()],
})
