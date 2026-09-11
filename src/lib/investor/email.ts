import "server-only";

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}

export async function sendInvestorInvitation(input: {
  to: string;
  companyName: string;
  inviteUrl: string;
  locale: "en" | "zh-tw";
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("Investor 邀請信尚未設定：缺少 RESEND_API_KEY 或 RESEND_FROM_EMAIL。");
  }
  const company = escapeHtml(input.companyName);
  const url = escapeHtml(input.inviteUrl);
  const zh = input.locale === "zh-tw";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: zh ? `${input.companyName} 邀請你查看 Investor Portal` : `${input.companyName} invited you to its Investor Portal`,
      html: zh
        ? `<p>${company} 邀請你查看其 Investor Portal。</p><p><a href="${url}">接受邀請</a></p><p>連結將於 7 天後失效，且只能使用一次。</p>`
        : `<p>${company} invited you to view its Investor Portal.</p><p><a href="${url}">Accept invitation</a></p><p>This one-time link expires in 7 days.</p>`,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend 寄送失敗（${res.status}）：${detail}`);
  }
}
