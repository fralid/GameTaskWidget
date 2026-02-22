import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import csp from 'vite-plugin-csp-guard';
import { readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

const ICON_EXT = new Set(['.ico', '.png', '.svg', '.webp']);

function listIcoRecursive(dir: string, base: string): string[] {
  const out: string[] = [];
  try {
    if (!statSync(dir).isDirectory()) return out;
  } catch {
    return out;
  }
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    try {
      if (statSync(full).isDirectory()) {
        out.push(...listIcoRecursive(full, rel));
      } else {
        const ext = '.' + (name.split('.').pop() ?? '').toLowerCase();
        if (ICON_EXT.has(ext)) out.push(rel);
      }
    } catch {
      // skip
    }
  }
  return out.sort();
}

function writeIcoManifest(root: string) {
  const icoDir = join(root, 'public', 'ico');
  try {
    const paths = listIcoRecursive(icoDir, '');
    const manifestPath = join(icoDir, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify(paths), 'utf8');
  } catch {
    // public/ico может не существовать
  }
}

function icoManifestPlugin() {
  return {
    name: 'ico-manifest',
    configResolved(config: { root: string }) {
      writeIcoManifest(config.root);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [
    icoManifestPlugin(),
    svelte(),
    csp({
      dev: { run: false },
      policy: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", 'https://fonts.googleapis.com'],
        'img-src': ["'self'", 'data:', 'https:'],
        'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
        'connect-src': ["'self'", 'https://fonts.googleapis.com'],
      },
    }),
  ],
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});
