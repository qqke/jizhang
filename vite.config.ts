import { defineConfig } from 'vite'

export default defineConfig({
 base: process.env.GITHUB_REPOSITORY ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/` : '/',
 resolve: {
  alias: [
   { find: /^react-dom\/client$/, replacement: 'preact/compat/client' },
   { find: /^react-dom$/, replacement: 'preact/compat' },
   { find: /^react\/jsx-runtime$/, replacement: 'preact/compat/jsx-runtime' },
   { find: /^react\/jsx-dev-runtime$/, replacement: 'preact/compat/jsx-dev-runtime' },
   { find: /^react$/, replacement: 'preact/compat' },
  ],
 },
})
