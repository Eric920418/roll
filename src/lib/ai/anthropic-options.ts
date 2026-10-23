import type { ClientOptions } from "@anthropic-ai/sdk";

export function anthropicOptions(options: Pick<ClientOptions, "timeout" | "maxRetries"> = {}): ClientOptions {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  if (!workspace) return options;
  if (!/^wrkspc_[A-Za-z0-9]+$/.test(workspace)) throw new Error("ANTHROPIC_WORKSPACE_ID 設定格式錯誤");
  return { ...options, defaultHeaders: { "anthropic-workspace-id": workspace } };
}
