import { defineConfig, type UserConfig } from 'tsdown';
import { entries } from './scripts/entries.mjs';

const shared: UserConfig = {
  entry: entries(),
  format: 'esm',
  platform: 'browser',
  treeshake: true,
  sourcemap: true,
  external: ['mediabunny', 'gifenc', /^d3-delaunay/, /^delaunator/],
};

export default defineConfig([
  {
    ...shared,
    outDir: 'dist',
    dts: { sourcemap: true },
    clean: true,
    define: { 'import.meta.env.DEV': 'false' },
  },
  {
    ...shared,
    outDir: 'dist/dev',
    dts: false,
    clean: false,
    define: { 'import.meta.env.DEV': 'true' },
  },
]);
