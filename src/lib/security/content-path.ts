import path from "node:path";
import fs from "node:fs";

/** Reject traversal before I/O, including symlinks escaping the content directory. */
export function contentJsonPath(directory: string, slug: string): string | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160) return null;
  const root = path.resolve(directory);
  const target = path.resolve(root, `${slug}.json`);
  if (path.dirname(target) !== root || !fs.existsSync(target)) return null;
  const relative = path.relative(fs.realpathSync(root), fs.realpathSync(target));
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) return null;
  return target;
}
