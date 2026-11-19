import type { ReactNode } from "react";
import { CHAPTERS, words } from "@/lib/action-plan/flow/catalog";
import type { FlowView } from "@/lib/action-plan/flow/service";
import { today } from "@/lib/roadmap/schema";
import { completedText } from "@/lib/action-plan/flow/evaluate";
import { companyKey } from "@/lib/customer-insights/interviews";
import { TaskSection } from "./OrganizeWork";

export default function TaskResults({ step, view, locale, children, updateProposal }: {
  step: FlowView["steps"][number];
  view: FlowView;
  locale: string;
  children?: ReactNode;
  updateProposal?(contactId: string, status: "replied" | "agreed"): void;
}) {
  const w = (zh: string, en: string) => locale === "zh-tw" ? zh : en;
  const confirmed = (value: boolean) => value ? w("已確認", "Confirmed") : w("待確認", "Pending");
  const percent = (value: number, total: number) => total ? Math.round(value / total * 100) + "%" : "—";
  const proofStatus = (p: FlowView["proofStatus"][number]) => p.revoked ? w("已撤銷", "Revoked") : p.approved ? w("已通過", "Approved") : p.status === "rejected" ? w("未通過", "Rejected") : w("待審核", "Under review");
  const proposals = view.steps.find(s => s.id === "02-1")?.data;
  let detail: string | undefined;
  let title = w("NOVA 整理結果", "NOVA findings");
  let headers: string[] = [], rows: Array<[string, ...ReactNode[]]> = [];

  if (step.id === "01-4") {
    title = w("客戶分級結果", "Customer tier results");
    headers = [w("受訪者", "Participant"), w("分數", "Score"), w("分級", "Tier"), w("下一步", "Next action")];
    rows = view.tiers.flatMap(tier => {
      const lead = view.leads.find(l => l.id === tier.leadId);
      return lead ? [[lead.company || lead.name, String(tier.score) + "/100", tier.confirmed ? tier.tier : "—", tier.confirmed ? (tier.tier === "A" ? w("提出付費試點", "Propose paid pilot") : tier.tier === "B" ? w("再進行一次對話", "Hold another conversation") : w("暫不跟進", "Pause follow-up")) : w("待分級", "Awaiting tier")]] : [];
    });
  } else if (step.id === "02-1" && step.data.kind === "outreach") {
    title = w("提案紀錄", "Proposal records");
    headers = [w("客戶", "Customer"), w("條件", "Terms"), w("寄出日", "Sent on"), w("狀態", "Status")];
    rows = step.data.contacts.map(c => {
      const latest = view.followups.find(row => row.step === "02-1" && row.contactId === c.id), status = latest?.status || c.status;
      const label = w({
        draft: "未寄出", sent: "已寄出", replied: "已回覆", conversation: "已對話", agreed: "已同意",
      }[status], {
        draft: "Not sent", sent: "Sent", replied: "Replied", conversation: "Conversation held", agreed: "Agreed",
      }[status]);
      const state = updateProposal && latest && !latest.resolved && (status === "sent" || status === "replied")
        ? <select className="min-h-11 rounded-lg border px-2" aria-label={c.company + " · " + w("狀態", "Status")} value={status} onChange={e => {
            if (e.target.value === "replied" || e.target.value === "agreed") updateProposal(c.id, e.target.value);
          }}>
            {status === "sent" && <option value="sent">{w("已寄出", "Sent")}</option>}
            <option value="replied">{w("已回覆", "Replied")}</option>
            <option value="agreed">{w("已同意", "Agreed")}</option>
          </select>
        : label;
      return [c.company, [c.pilotPrice, c.pilotDuration && w(c.pilotDuration + " 個月", c.pilotDuration + " months")].filter(Boolean).join(" · "), c.date, state];
    });
  } else if (step.id === "02-2" || step.id === "04-1") {
    const names = new Set(proposals?.kind === "outreach" ? proposals.contacts.filter(c => c.status !== "draft").map(c => companyKey(c.company)) : []);
    const proofs = view.proofStatus.filter(p => step.id === "02-2" ? names.has(companyKey(p.company)) : p.kind === "paid");
    title = step.id === "02-2" ? w("有效商業承諾", "Valid commercial commitments") : w("付費客戶", "Paying customers");
    detail = step.current + " / " + step.target;
    headers = [w("客戶", "Customer"), w("證明", "Evidence"), w("金額", "Amount"), w("進度", "Status")];
    rows = proofs.map(p => [p.company, p.kind === "paid" ? w("付款", "Payment") : w("付費合約", "Paid contract"), [p.currency, p.amount].filter(Boolean).join(" "), [proofStatus(p), p.status === "rejected" && p.note].filter(Boolean).join(" · ")]);
    if (proposals?.kind === "outreach") {
      for (const c of proposals.contacts.filter(c => c.status !== "draft")) {
        if (!rows.some(row => companyKey(row[0]) === companyKey(c.company))) rows.push([c.company, "—", "—", w("尚未上傳", "No proof uploaded")]);
      }
    }
  } else if (step.id === "05-2" && step.data.kind === "outreach") {
    title = w("第二市場的對話發現", "Second-market findings");
    const day = today(), opened = view.steps.find(s => s.id === "05-1")?.completedAt;
    const since = opened ? today(new Date(opened)) : day;
    const conversations = step.data.contacts.filter(c => c.status === "conversation" && c.company && c.channel && completedText(c.offer) && c.date && c.date <= day && c.pain && c.solution && c.wtp && c.wtp !== "not_asked");
    const names = new Set(conversations.map(c => companyKey(c.company)));
    const findings = new Map<string, Set<string>>();
    for (const row of conversations) findings.set(row.pain, new Set([...(findings.get(row.pain) || []), companyKey(row.company)]));
    const proofs = view.proofStatus.filter(p => p.kind === "paid" && !p.revoked && p.date >= since && names.has(companyKey(p.company)));
    const approved = new Set(proofs.filter(p => p.approved).map(p => companyKey(p.company))).size;
    detail = w(`${step.current}/10 家對話 · ${approved} 家付款通過審核`, `${step.current}/10 company conversations · ${approved} approved paying customers`);
    headers = [w("發現", "Finding"), w("佐證", "Sources")];
    rows = [...findings].sort((a, b) => b[1].size - a[1].size).slice(0, 3).map(([finding, sources]) => [finding, sources.size + " / " + names.size]);
    children = <>{children}{proofs.filter(p => !p.approved).map((p, i) =>
      <p key={p.company + i} className="text-xs">{p.company} · {proofStatus(p)}{p.status === "rejected" && p.note ? " · " + p.note : ""}</p>
    )}</>;
  } else if (step.id === "02-3" && step.data.kind === "organize") {
    const data = step.data;
    title = w("定價與成交條件", "Pricing and commercial terms");
    headers = [w("項目", "Item"), w("內容", "Details"), w("狀態", "Status")];
    rows = [["price", w("價格", "Price")], ["scope", w("試點範圍", "Pilot scope")], ["terms", w("成交條件", "Terms")]]
      .map(([key, label]) => [label, data.values[key] || "", confirmed(data.confirmed.includes(key))]);
  } else if (step.id === "03-1") {
    title = w("每週開發進度", "Weekly outreach progress");
    headers = [w("週次", "Week"), w("已聯絡／目標", "Contacts / target"), w("回覆", "Replies"), w("有效對話", "Valid conversations")];
    rows = view.weeks.slice(-4).map(week => [week.date, week.contacts + " / 20", String(week.replies), String(week.conversations)]);
  } else if (step.id === "03-2" && step.data.kind === "organize") {
    const selected = step.data.selections;
    title = w("管道成效排名", "Channel performance");
    headers = [w("管道", "Channel"), w("聯絡", "Contacts"), w("回覆率", "Reply rate"), w("對話率", "Conversation rate"), w("成交率", "Conversion rate"), w("保留", "Retained")];
    rows = view.channels.map(c => [c.channel, String(c.total), percent(c.reply, c.total), percent(c.conversation, c.total), percent(c.paid, c.total), selected.includes(c.channel) ? w("是", "Yes") : "—"]);
  } else if (step.data.kind === "document") {
    const data = step.data;
    title = step.id === "05-3" ? w("市場驗證報告", "Market validation report") : w("手冊章節進度", "Playbook progress");
    headers = [w("章節", "Chapter"), w("內容", "Content"), w("狀態", "Status")];
    rows = (CHAPTERS[step.id] || []).map((label, i) => {
      const chapter = data.sections.find(s => s.id === String(i));
      const firstLine = chapter?.body.split("\n").find(Boolean) || "";
      return [words(label, locale), firstLine.length > 130 ? firstLine.slice(0, 130) + "…" : firstLine, confirmed(Boolean(chapter?.confirmed))];
    });
  } else if (step.id === "04-2") {
    title = w("回顧發現", "Review findings");
    headers = [w("留下或續約的原因", "Reason to stay or renew")];
    rows = step.summary.slice(1).map(result => [result]);
  } else if (step.id === "04-3") {
    const { currency, averageRevenue, acquisitionCost, renewalRate } = view.metrics;
    title = w("客戶指標", "Customer metrics");
    headers = [w("指標", "Metric"), w("計算結果", "Result")];
    rows = [
      [w("續約率", "Renewal rate"), renewalRate == null ? w("不適用（無到期客戶）", "N/A (no eligible customers)") : Math.round(renewalRate * 100) + "%"],
      [w("平均客單價", "Revenue per customer"), `${currency} ${averageRevenue}`],
      [w("現金取得成本", "Cash acquisition cost"), acquisitionCost == null ? "—" : `${currency} ${acquisitionCost}`],
    ];
  } else if (step.id === "05-1") {
    const { payingCustomers, neededConversations, neededContacts, weeklyContacts, weeklyConversations } = view.weekly;
    const count = (value: number | null | undefined) => value ? value.toLocaleString(locale) : "—";
    title = w("每週開發量", "Weekly activity");
    headers = [w("項目", "Item"), w("數量", "Count"), w("算法", "Calculation")];
    rows = [
      [w("付款客戶", "Paying customers"), count(payingCustomers), w("季度營收目標 ÷ 平均客單價", "Quarterly target ÷ average revenue per customer")],
      [w("需要的對話", "Conversations needed"), count(neededConversations), w("付款客戶 ÷ 對話到成交率", "Paying customers ÷ conversation-to-sale rate")],
      [w("需要聯絡的公司", "Companies to contact"), count(neededContacts), w("需要的對話 ÷ 聯絡到對話率", "Conversations needed ÷ contact-to-conversation rate")],
      [w("每週聯絡", "Weekly contacts"), count(weeklyContacts), w("需要聯絡的公司 ÷ 13 週", "Companies to contact ÷ 13 weeks")],
      [w("每週對話", "Weekly conversations"), count(weeklyConversations), w("需要的對話 ÷ 13 週", "Conversations needed ÷ 13 weeks")],
    ];
  }

  return <section data-next-step="insights" data-task-section="results" className="space-y-3">
    <TaskSection number="03" title={title} detail={step.id === "05-3" && step.done ? view.reportCode : detail} />
    <div className="space-y-3 rounded-2xl border border-dark/10 bg-white p-4 sm:px-5">
      {rows.length > 0 ? <div className="overflow-x-auto"><table className="w-full min-w-72 text-left text-sm">
        <thead className="text-xs text-dark/60"><tr>{headers.map(label => <th key={label} className="px-2 py-3 font-medium" scope="col">{label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index} className="border-t border-dark/10 align-top">
          <th className="min-w-24 px-2 py-3 text-left font-semibold" scope="row">{row[0] || "—"}</th>
          {row.slice(1).map((value, col) => <td key={col} className="whitespace-pre-wrap px-2 py-3 [overflow-wrap:anywhere]">{value || "—"}</td>)}
        </tr>)}</tbody>
      </table></div> : <p className="text-sm text-dark/60">{w("尚無紀錄。", "No saved records yet.")}</p>}
      {children}
    </div>
  </section>;
}
