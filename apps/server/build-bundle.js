// Bundles the server TypeScript into a single JS file for Electron packaging.
// Native modules (@prisma/client) are marked external and copied separately.
const { build } = require('esbuild');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');

// Plugin to resolve monorepo workspace aliases
const workspaceAliasPlugin = {
  name: 'workspace-alias',
  setup(build) {
    build.onResolve({ filter: /^@eat-and-meet\// }, args => {
      const pkg = args.path.replace('@eat-and-meet/', '');
      return { path: path.join(root, 'packages', pkg, 'src', 'index.ts') };
    });
  },
};

build({
  entryPoints: [path.join(__dirname, 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: path.join(__dirname, 'dist', 'bundle.js'),
  external: [
    '@prisma/client',
    '.prisma',
    '.prisma/client',
    // node-thermal-printer uses a native Windows printer addon; keep it as an
    // external node_module so its .node binary can be copied to resources instead
    // of being inlined (where the binary path would break at runtime).
    'node-thermal-printer',
  ],
  plugins: [workspaceAliasPlugin],
  tsconfig: path.join(__dirname, 'tsconfig.json'),
  minify: false,
  sourcemap: false,
  logLevel: 'info',
}).catch(() => process.exit(1));
