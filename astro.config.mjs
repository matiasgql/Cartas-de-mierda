// @ts-check
import mkcert from 'vite-plugin-mkcert'
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss(), mkcert()]
  }
});