import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile, chmod } from "node:fs/promises";

export const dir = dirname(fileURLToPath(import.meta.url)), repo = join(dir, "../..");
export const raw = join(dir, "raw"), generated = join(dir, "assets/generated"), renders = join(dir, "renders");
export const origin = "http://localhost:3127";
export const chrome = process.env.NOVA_CHROME_EXECUTABLE || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const requireTool = createRequire(join(realpathSync(join(repo, "node_modules/hyperframes")), "package.json"));
export const toolsEnv = { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1", HYPERFRAMES_SKIP_SKILLS: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1", HYPERFRAMES_NO_AUTO_INSTALL: "1", HYPERFRAMES_BROWSER_PATH: chrome };
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const binary = name => join(repo, "node_modules/.bin", name);

export function localDatabase(value) {
  const url = new URL(value);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Tutorial capture rejects remote databases");
  assert.match(url.pathname, /^\/roll_rewards_qa_tutorial_[a-z0-9_]+$/, "Tutorial capture requires its own dedicated database");
  return url;
}

export function run(command, args, { cwd = repo, env = toolsEnv, quiet = false, captureStderr = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", data => { stdout += data; if (!quiet) process.stdout.write(data); });
    child.stderr.on("data", data => { stderr += data; if (!quiet) process.stderr.write(data); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(captureStderr ? stdout + stderr : stdout) : reject(new Error(`${command} ${args.join(" ")}\nExit ${code}\n${stdout}\n${stderr}`)));
  });
}

export async function showError(error) {
  await mkdir(generated, { recursive: true });
  await writeFile(join(generated, "status.js"), `window.novaError(${JSON.stringify(error.stack || String(error))});\n`);
}

export async function renderEnvironment() {
  const { default: puppeteer } = requireTool('puppeteer-core');
  const launch = executablePath => puppeteer.launch({ executablePath, headless: true, defaultViewport: null, args: ['--no-sandbox','--disable-gpu','--window-size=1920,1080'] });
  const browser = await launch(chrome);
  let padding;
  try { const page = await browser.newPage(); padding = await page.evaluate(() => 1080 - innerHeight); }
  finally { await browser.close(); }
  assert.ok(padding >= 0 && padding < 200, 'Unexpected Chrome window calibration');
  await mkdir(generated,{recursive:true});
  const wrapper = join(generated,'chrome-render.sh');
  const quoted = "'" + chrome.replaceAll("'", "'\\''") + "'";
  await writeFile(wrapper, '#!/bin/sh\nexec ' + quoted + ' "$@" --window-size=1920,' + (1080 + padding) + '\n');
  await chmod(wrapper, 0o755);
  const calibrated = await launch(wrapper);
  try { const page = await calibrated.newPage(); assert.equal(await page.evaluate(() => innerHeight),1080,'The actual render viewport must contain every caption pixel'); }
  finally { await calibrated.close(); }
  return {...toolsEnv,HYPERFRAMES_BROWSER_PATH:wrapper,HF_VIDEO_LAYER_PASSTHROUGH:'true'};
}
