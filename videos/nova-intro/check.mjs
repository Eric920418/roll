import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";

export async function filmText(dir) {
  const files = (await readdir(join(dir, "compositions"))).filter(f => f.endsWith(".html"));
  const html = (await Promise.all(files.map(f => readFile(join(dir, "compositions", f), "utf8")))).join("\n");
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
}

export async function checkSources(dir, repo) {
  const index = await readFile(join(dir, "index.html"), "utf8");
  const hosts = [...index.matchAll(/<div[^>]+data-composition-src="([^"]+)"[^>]+data-start="([\d.]+)"[^>]+data-duration="([\d.]+)"[^>]*>/g)];
  assert.equal(hosts.length, 9, "九段分鏡必須全部存在");
  let end = 0;
  for (const [, file, start, duration] of hosts) {
    assert.equal(Number(start), end, `${file} 時間軸有空隙或重疊`);
    assert.ok(Number(duration) >= 4, `${file} 沒有足夠閱讀時間`);
    end += Number(duration);
    const html = await readFile(join(dir, file), "utf8");
    assert.ok(html.includes("Nova.register("), `${file} 未註冊可定位時間軸`);
    assert.ok(!/Math\.random|Date\.now|setInterval|requestAnimationFrame/.test(html), `${file} 使用非確定性時間`);
    for (const [, src] of html.matchAll(/src="([^"]+)"/g)) {
      assert.ok(src.startsWith("assets/"), `${file} 使用遠端或不正確素材路徑`);
      await access(join(dir, src));
    }
  }
  assert.equal(end, 60, "影片必須剛好 60 秒");
  for (const asset of ["assets/generated/score.wav", "assets/generated/gsap.min.js", "assets/fonts/nova-tc.woff2"]) await access(join(dir, asset));
  const require = createRequire(join(realpathSync(join(repo, "node_modules/hyperframes")), "package.json"));
  const fontkit = require("fontkit");
  const font = fontkit.create(await readFile(join(dir, "assets/fonts/nova-tc.woff2")));
  const missing = [...new Set(await filmText(dir))].filter(c => !/\s/.test(c) && !font.hasGlyphForCodePoint(c.codePointAt(0)));
  assert.deepEqual(missing, [], `字型缺字：${missing.join("")}`);
  const wav = await readFile(join(dir, "assets/generated/score.wav"));
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(24), 48000);
  assert.equal(wav.readUInt32LE(40), 60 * 48000 * 4);
  let peak = 0, energy = 0;
  for (let i = 44; i < wav.length; i += 2) { const n = wav.readInt16LE(i); peak = Math.max(peak, Math.abs(n)); energy += n * n; }
  assert.ok(peak < 32767 && energy > 1e10, "配樂有削波或靜音");
  return { scenes: hosts.length, seconds: end, fontGlyphs: font.numGlyphs, audioPeak: peak / 32767 };
}

export function checkVideo(file) {
  const result = spawnSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const info = JSON.parse(result.stdout);
  const video = info.streams.find(s => s.codec_type === "video"), audio = info.streams.find(s => s.codec_type === "audio");
  assert.ok(video && audio, "影片必須同時包含畫面與配樂");
  assert.equal(video.width, 1920); assert.equal(video.height, 1080);
  assert.equal(video.r_frame_rate, "30/1"); assert.equal(Number(video.nb_frames), 1800);
  assert.equal(video.codec_name, "h264"); assert.equal(video.pix_fmt, "yuv420p");
  assert.equal(audio.codec_name, "aac");
  assert.ok(Math.abs(Number(video.duration) - 60) < 0.04);
  const decode = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"], { encoding: "utf8" });
  assert.equal(decode.status, 0, decode.stderr); assert.equal(decode.stderr.trim(), "", "成片解碼錯誤");
  return { width: video.width, height: video.height, fps: 30, frames: 1800, seconds: Number(video.duration), audio: audio.codec_name };
}
