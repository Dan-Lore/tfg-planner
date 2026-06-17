/** Resolve a path under Vite `public/` for dev and GitHub Pages subpaths. */
export function publicPath(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const base = import.meta.env.BASE_URL;
  const rel = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${rel}`;
}
