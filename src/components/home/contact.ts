type HomeContactPayload = {
  name: string;
  email: string;
  message: string;
  company: string;
  locale: string;
};

export async function submitHomeContact(
  payload: HomeContactPayload,
  fallbackError: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher("/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  let json: { error?: unknown; requestId?: unknown; data?: { received?: unknown } } | null = null;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(`HTTP ${response.status}: ${body || fallbackError}`);
  }

  if (response.ok && json?.data?.received === true) return;

  const detail = typeof json?.error === "string"
    ? json.error
    : json?.error != null ? JSON.stringify(json.error) : body;
  let message = `HTTP ${response.status}: ${detail || fallbackError}`;
  if (typeof json?.requestId === "string" && !message.includes(json.requestId)) {
    message += `\nReference: ${json.requestId}`;
  }
  throw new Error(message);
}
