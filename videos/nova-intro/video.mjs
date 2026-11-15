import { mkdir, readFile, writeFile, copyFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { writeScore } from "./score.mjs";
import { checkSources, checkVideo, filmText } from "./check.mjs";

const dir = dirname(fileURLToPath(import.meta.url)), repo = join(dir, "../..");
const generated = join(dir, "assets/generated"), renders = join(dir, "renders");
const env = { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1", HYPERFRAMES_SKIP_SKILLS: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1", HYPERFRAMES_NO_AUTO_INSTALL: "1" };
const mode = process.argv[2] || "preview";
const output = join(renders, "nova-ai-intro-zh-tw.mp4");
const exists = path => access(path).then(() => true, () => false);
const binary = name => join(repo, "node_modules/.bin", name);

function run(command, args, quiet = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; if (!quiet) process.stdout.write(chunk); });
    child.stderr.on("data", chunk => { stderr += chunk; if (!quiet) process.stderr.write(chunk); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(stdout) : reject(new Error(`${command} ${args.join(" ")}\nExit ${code}\n${stdout}\n${stderr}`)));
  });
}

async function prepare() {
  await mkdir(generated, { recursive: true }); await mkdir(renders, { recursive: true });
  await writeFile(join(generated, "status.js"), "// Last production command succeeded.\n");
  await writeFile(join(generated, ".env.video"), "# This offline film does not use application secrets.\n");
  await copyFile(join(repo, "node_modules/gsap/dist/gsap.min.js"), join(generated, "gsap.min.js"));
  for (const color of ["white", "black"]) await copyFile(join(repo, `public/nova/logo-${color}.png`), join(generated, `logo-${color}.png`));
  const text = [...new Set(await filmText(dir))].sort().join("");
  const hash = createHash("sha256").update(text + ":NotoSansTC:400..900").digest("hex");
  const fontDir = join(dir, "assets/fonts"), font = join(fontDir, "nova-tc.woff2");
  await mkdir(fontDir, { recursive: true });
  const charset = join(fontDir, "charset.json");
  if (!(await exists(font)) || !(await exists(charset)) || JSON.parse(await readFile(charset, "utf8")).sha256 !== hash) {
    console.log("Preparing the local Traditional Chinese font…");
    const css = await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400..900&text=${encodeURIComponent(text)}&display=block`, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" } });
    if (!css.ok) throw new Error(`字型樣式下載失敗：HTTP ${css.status}\n${await css.text()}`);
    const stylesheet = await css.text(), url = stylesheet.match(/url\((https:[^)]+)\)/)?.[1];
    if (!url) throw new Error(`字型回應沒有下載網址：\n${stylesheet}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`字型下載失敗：HTTP ${response.status}`);
    await writeFile(font, Buffer.from(await response.arrayBuffer()));
    await writeFile(charset, JSON.stringify({ family: "Noto Sans TC", sha256: hash, text, source: "https://fonts.google.com/noto/specimen/Noto+Sans+TC", license: "SIL Open Font License 1.1; full text in README.md" }, null, 2) + "\n");
  }
  const audioHash = createHash("sha256").update(await readFile(join(dir, "score.mjs"))).digest("hex");
  if (!(await exists(join(generated, "score.sha256"))) || (await readFile(join(generated, "score.sha256"), "utf8")) !== audioHash) {
    console.log("Synthesizing the original 120 BPM score…");
    await writeScore(join(generated, "score.wav")); await writeFile(join(generated, "score.sha256"), audioHash);
  }
  const installedChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const chrome = process.env.NOVA_CHROME_EXECUTABLE || (process.platform === "darwin" && await exists(installedChrome) ? installedChrome : null);
  if (chrome) env.HYPERFRAMES_BROWSER_PATH = chrome;
  const browserArgs = chrome ? ["--browser-executable=" + chrome] : [];
  const metalHash = createHash("sha256").update(await readFile(join(dir, "remotion/index.tsx"))).update("remotion-4.0.543-angle:" + (chrome || "bundled")).digest("hex");
  for (const [id, file] of [["MetalIntro", "metal-intro.mp4"], ["MetalOutro", "metal-outro.mp4"]]) {
    const stamp = join(generated, file + ".sha256");
    if (!(await exists(join(generated, file))) || !(await exists(stamp)) || (await readFile(stamp, "utf8")) !== metalHash) {
      console.log(`Rendering ${id} with Remotion + Three.js…`);
      await run(binary("remotion"), ["render", join(dir, "remotion/index.tsx"), id, join(generated, file), "--codec=h264", "--crf=16", "--gl=angle", "--concurrency=2", "--log=warn", "--env-file=" + join(generated, ".env.video"), ...browserArgs], true);
      await writeFile(stamp, metalHash);
    }
  }
  console.log("Source checks:", await checkSources(dir, repo));
}

async function main() {
  if (!["prepare", "preview", "render", "check"].includes(mode)) throw new Error(`Unknown video command: ${mode}`);
  await prepare();
  if (mode === "prepare") return;
  if (mode === "preview") {
    await run(binary("hyperframes"), ["preview", dir, "--port=4310", "--background", ...process.argv.slice(3).filter(a => a !== "--")]); return;
  }
  await run(binary("hyperframes"), ["lint", dir]);
  if (mode === "check") {
    const report = await run(binary("hyperframes"), ["check", dir, "--json", "--strict", "--no-cache", "--at=2,6,14,23,32,40,48,52.5,58", "--at-transitions", "--max-transition-samples=72", "--budget=4m", "--snapshots"], true);
    await writeFile(join(renders, "hyperframes-check.json"), report);
    const parsed = JSON.parse(report);
    console.log("HyperFrames checks:", Object.fromEntries(Object.entries(parsed).filter(([, v]) => v?.findings).map(([k, v]) => [k, { errors: v.errorCount, warnings: v.warningCount }])));
    console.log("Video checks:", checkVideo(output)); return;
  }
  await run(binary("hyperframes"), ["render", dir, "--output", output, "--fps=30", "--quality=looks", "--workers=2", "--no-browser-gpu", "--no-best-effort"]);
  const verified = checkVideo(output);
  await run("ffmpeg", ["-y", "-v", "error", "-ss", "58", "-i", output, "-frames:v", "1", "-q:v", "2", join(renders, "nova-ai-intro-cover.jpg")]);
  await writeFile(join(renders, "verification.json"), JSON.stringify(verified, null, 2) + "\n");
  console.log("Delivered:", output, verified);
}

try { await main(); }
catch (error) {
  await mkdir(generated, { recursive: true });
  await writeFile(join(generated, "status.js"), `window.novaError(${JSON.stringify(error.stack || String(error))});\n`);
  console.error(error);
  if (mode === "preview") {
    console.error("Opening preview with the complete error panel.");
    try { await run(binary("hyperframes"), ["preview", dir, "--port=4310", "--background", ...process.argv.slice(3).filter(a => a !== "--")]); }
    catch (previewError) { console.error(previewError); }
  }
  process.exitCode = 1;
}
