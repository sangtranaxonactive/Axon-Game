// Bundles + minifies the browser code into public/dist. Source files in src/ are never served.
const esbuild = require('esbuild');
const path = require('path');
const root = path.join(__dirname, '..');
module.exports = esbuild.build({
  entryPoints: { game: path.join(root, 'src/main.js'), screen: path.join(root, 'src/screen.js'), editor: path.join(root, 'src/editor.js'), live: path.join(root, 'src/live.js') },
  outdir: path.join(root, 'public/dist'), bundle: true, minify: true, format: 'esm', target: 'es2022',
  sourcemap: false, legalComments: 'none', logLevel: 'warning',
}).catch(e => { console.error(e); process.exit(1); });
