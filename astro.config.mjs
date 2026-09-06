// @ts-check
import mkcert from 'vite-plugin-mkcert'
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://matiasgql.github.io',
  base: '/Cartas-de-mierda/',
  vite: {
    plugins: [tailwindcss(), mkcert()]
  }
});