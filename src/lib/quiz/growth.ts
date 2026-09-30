import type { Choice } from "./match";

export const GROWTH_DIMENSIONS = [
  "growth-bottleneck",
  "growth-style",
  "growth-milestone",
] as const;

export type GrowthProfile = {
  kind: "growth-v1";
  answers: {
    dimension: (typeof GROWTH_DIMENSIONS)[number];
    choice: Choice;
    label: { en: string; "zh-tw": string };
    desc: { en: string; "zh-tw": string };
  }[];
};

export function parseGrowthProfile(value: unknown): GrowthProfile | null {
  if (!value || typeof value !== "object") return null;
  const profile = value as Partial<GrowthProfile>;
  if (profile.kind !== "growth-v1" || !Array.isArray(profile.answers)) return null;
  if (profile.answers.length !== GROWTH_DIMENSIONS.length) return null;
  for (let i = 0; i < GROWTH_DIMENSIONS.length; i++) {
    const answer = profile.answers[i];
    if (answer?.dimension !== GROWTH_DIMENSIONS[i] ||
        !["A", "B", "C", "D"].includes(answer.choice) ||
        typeof answer.label?.en !== "string" ||
        typeof answer.label?.["zh-tw"] !== "string" ||
        typeof answer.desc?.en !== "string" ||
        typeof answer.desc?.["zh-tw"] !== "string") return null;
  }
  return profile as GrowthProfile;
}
