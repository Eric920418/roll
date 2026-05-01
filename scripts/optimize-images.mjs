#!/usr/bin/env node
// 一次性圖片優化腳本
// 使用：node scripts/optimize-images.mjs
//
// 行為：
// 1. 掃描 src/ + content/ + messages/ 中實際被引用的圖片路徑
// 2. 把 public/ 內所有 PNG/JPG 原檔複製到 public/_originals/（已忽略入版控）
// 3. 對「實際被引用」的圖片：原地優化（縮到 max 2000px、PNG 壓縮、JPG quality 82 mozjpeg）
// 4. 對「未被引用」的圖片：印出 warning，不動原檔（使用者自己決定要不要刪 _originals/）
//
// 為何不直接刪除未引用的圖片：CLAUDE.md 規則「不要亂覆蓋資料庫裡得資料」 — 對待靜態資產用同樣態度。

import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const ORIGINALS_DIR = path.join(PUBLIC_DIR, "_originals");
const SCAN_DIRS = ["src", "content", "messages"];
const MAX_WIDTH = 2000;
const JPG_QUALITY = 82;

const IMG_EXT = /\.(png|jpe?g)$/i;

async function walk(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next" || e.name === "_originals") continue;
      out.push(...(await walk(full)));
    } else {
      out.push(full);
    }
  }
  return out;
}

async function findReferencedImages() {
  const refs = new Set();
  const pattern = /\/[A-Za-z0-9._一-鿿 -]+\.(png|jpe?g)/gi;

  for (const d of SCAN_DIRS) {
    const dir = path.join(ROOT, d);
    try {
      const files = await walk(dir);
      for (const f of files) {
        if (!/\.(tsx?|mdx|json)$/.test(f)) continue;
        const content = await fs.readFile(f, "utf8");
        const matches = content.match(pattern);
        if (matches) {
          for (const m of matches) refs.add(m.slice(1)); // 去開頭 /
        }
      }
    } catch (err) {
      console.error(`掃描 ${d} 失敗：`, err.message);
    }
  }
  return refs;
}

async function listPublicImages() {
  const entries = await fs.readdir(PUBLIC_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && IMG_EXT.test(e.name))
    .map((e) => e.name);
}

async function backupOriginal(filename) {
  await fs.mkdir(ORIGINALS_DIR, { recursive: true });
  const src = path.join(PUBLIC_DIR, filename);
  const dst = path.join(ORIGINALS_DIR, filename);
  // 已經備份過就不重覆覆蓋（保留最早的原檔）
  try {
    await fs.access(dst);
    return false; // 已存在，跳過
  } catch {
    await fs.copyFile(src, dst);
    return true;
  }
}

async function optimizeImage(filename) {
  const filepath = path.join(PUBLIC_DIR, filename);
  const ext = path.extname(filename).toLowerCase();
  const stat = await fs.stat(filepath);
  const beforeBytes = stat.size;

  const img = sharp(filepath, { failOn: "none" });
  const meta = await img.metadata();
  const needsResize = (meta.width ?? 0) > MAX_WIDTH;

  let pipeline = img;
  if (needsResize) {
    pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
  }

  let buf;
  if (ext === ".png") {
    buf = await pipeline.png({ compressionLevel: 9, palette: true, effort: 10 }).toBuffer();
  } else {
    buf = await pipeline.jpeg({ quality: JPG_QUALITY, mozjpeg: true, progressive: true }).toBuffer();
  }

  // 只有當優化結果確實變小才覆蓋（避免反而變大）
  if (buf.length >= beforeBytes) {
    return { filename, before: beforeBytes, after: beforeBytes, skipped: true, reason: "no improvement" };
  }

  await fs.writeFile(filepath, buf);
  return { filename, before: beforeBytes, after: buf.length, width: meta.width, resized: needsResize };
}

function fmtKB(b) {
  return (b / 1024).toFixed(1) + "KB";
}

async function main() {
  console.log("→ 掃描程式碼引用的圖片...");
  const referenced = await findReferencedImages();
  console.log(`  找到 ${referenced.size} 個被引用的圖片\n`);

  console.log("→ 列出 public/ 圖片...");
  const allImages = await listPublicImages();
  console.log(`  共 ${allImages.length} 個 PNG/JPG\n`);

  const used = [];
  const unused = [];
  for (const name of allImages) {
    if (referenced.has(name)) used.push(name);
    else unused.push(name);
  }

  if (unused.length > 0) {
    console.log("⚠ 未被引用的圖片（不會自動處理，請手動確認是否刪除）：");
    for (const u of unused) {
      const stat = await fs.stat(path.join(PUBLIC_DIR, u));
      console.log(`    ${u}  (${fmtKB(stat.size)})`);
    }
    console.log("");
  }

  console.log(`→ 優化 ${used.length} 個被引用的圖片...\n`);
  let totalBefore = 0, totalAfter = 0;
  const results = [];
  for (const name of used) {
    try {
      await backupOriginal(name);
      const r = await optimizeImage(name);
      results.push(r);
      totalBefore += r.before;
      totalAfter += r.after;
      const delta = r.before - r.after;
      const pct = r.before > 0 ? ((delta / r.before) * 100).toFixed(0) : 0;
      const tag = r.skipped ? "skip" : (r.resized ? `${r.width}→${MAX_WIDTH}` : "compress");
      console.log(`  ${r.skipped ? "·" : "✓"} ${name.padEnd(36)} ${fmtKB(r.before).padStart(10)} → ${fmtKB(r.after).padStart(10)}  (-${pct}%, ${tag})`);
    } catch (err) {
      console.error(`  ✗ ${name} — ${err.message}`);
    }
  }

  console.log(`\n總計：${fmtKB(totalBefore)} → ${fmtKB(totalAfter)}  節省 ${fmtKB(totalBefore - totalAfter)} (${((1 - totalAfter / totalBefore) * 100).toFixed(0)}%)`);
  console.log(`\n原檔備份在 public/_originals/（已 gitignore，需要回滾時可手動還原）`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
