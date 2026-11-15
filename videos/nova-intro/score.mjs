import { writeFile } from "node:fs/promises";

// Original 120 BPM score: deterministic synthesis, no samples or external music.
export async function writeScore(file) {
  const rate = 48000, length = rate * 60, samples = new Float32Array(length);
  const roots = [146.8324, 116.5409, 174.6141, 130.8128];
  const melody = [0, 7, 12, 10, 7, 3, 7, 15];
  const cuts = [4, 8, 16, 26, 34, 42, 50, 54];
  let seed = 20261116, peak = 0;
  for (let i = 0; i < length; i++) {
    const t = i / rate, beat = t % 0.5, bar = Math.floor(t / 8) % 4;
    const root = roots[bar];
    const pulse = 0.72 + 0.28 * Math.sin(t * Math.PI * 4);
    const pad = (Math.sin(t * root * Math.PI * 2) + 0.5 * Math.sin(t * root * 1.5 * Math.PI * 2) + 0.3 * Math.sin(t * root * 2 * Math.PI * 2)) * 0.085 * pulse;
    const kick = Math.sin(2 * Math.PI * (44 * beat + 4 * (1 - Math.exp(-32 * beat)))) * Math.exp(-beat * 20) * 0.28;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    const hat = noise * Math.exp(-(t % 0.25) * 125) * 0.035;
    const note = root * 2 ** (melody[Math.floor(t * 4) % melody.length] / 12) * 2;
    const pluckAge = t % 0.25;
    const pluck = Math.sin(t * note * Math.PI * 2) * Math.exp(-pluckAge * 15) * 0.065;
    let accent = 0;
    for (const cut of cuts) {
      const age = t - cut;
      if (age >= 0 && age < 1.5) accent += (Math.sin(age * 880 * Math.PI * 2) + Math.sin(age * 1320 * Math.PI * 2)) * Math.exp(-age * 5) * 0.055;
    }
    const envelope = Math.min(1, t / 1.2, (60 - t) / 2.5);
    samples[i] = Math.tanh((pad + kick + hat + pluck + accent) * envelope);
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  const wav = Buffer.alloc(44 + length * 4);
  wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(length * 4, 40);
  for (let i = 0; i < length; i++) {
    const left = samples[i] * 0.78 / peak;
    const delayed = i >= 7200 ? samples[i - 7200] * 0.12 : 0;
    const right = (samples[i] * 0.9 + delayed) * 0.74 / peak;
    wav.writeInt16LE(Math.round(left * 32767), 44 + i * 4);
    wav.writeInt16LE(Math.round(Math.max(-0.9, Math.min(0.9, right)) * 32767), 46 + i * 4);
  }
  await writeFile(file, wav);
}
