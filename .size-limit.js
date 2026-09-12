import { entries, patternFor } from './scripts/entries.mjs';

/** One size check per built entry; peers and dynamic imports never count towards a total. */
export default Object.keys(entries()).map((name) => ({
  name: `${patternFor(name)} ${name}`,
  path: `dist/${name}.js`,
  gzip: true,
  ignore: ['d3-delaunay', 'delaunator', 'mediabunny', 'gifenc'],
}));
