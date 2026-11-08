import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // Project site on GitHub Pages is served from /<repo>/. Local dev stays at /.
  base: process.env.GITHUB_ACTIONS ? '/live_fluid_sound_visualiser_web/' : '/',
})
