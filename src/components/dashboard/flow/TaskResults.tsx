import type { ReactNode } from "react";
import { CHAPTERS, words } from "@/lib/action-plan/flow/catalog";
import type { FlowView } from "@/lib/action-plan/flow/service";
import { companyKey } from "@/lib/customer-insights/interviews";
import { TaskSection } from "./OrganizeWork";

export default function TaskResults({ step, view, locale, children }: {
  step: FlowView["steps"][number];
  view: FlowView;
  locale: string;
  children?: ReactNode;
}) {
  const w = (zh: string, en: string) => locale === "zh-tw" ? zh : en;
  const confirmed = (value: boolean) => value ? w("已確認", "Confirmed") : w("待確認", "Pending");
  const percent = (value: number, total: number) => total ? Math.round(value / total * 100) + "%" : "—";
  let title = w("NOVA 整理結果", "NOVA findings");
  let headers: string[] = [], rows: string[][] = [];

  if (step.id === "01-4") {
    title = w("客戶分級結果", "Customer tier results");
    headers = [w("受訪者", "Participant"), w("分數", "Score"), w("分級", "Tier"), w("狀態", "Status")];
    rows = view.tiers.flatMap(tier => {
      const lead = view.leads.find(l => l.id === tier.leadId);
      return lead ? [[lead.company || lead.name, String(tier.score), tier.tier, confirmed(tier.confirmed)]] : [];
    });
  } else if (step.id === "02-1" && step.data.kind === "outreach") {
    title = w("提案紀錄", "Proposal records");
    headers = [w("公司", "Company"), w("日期", "Date"), w("管道", "Channel"), w("狀態", "Status")];
    rows = step.data.contacts.map(c => [c.company, c.date, c.channel, w({
      draft: "草稿", sent: "已寄出", replied: "已回覆", conversation: "已對話", agreed: "已同意",
    }[c.status], {
      draft: "Draft", sent: "Sent", replied: "Replied", conversation: "Conversation held", agreed: "Agreed",
    }[c.status])]);
  } else if (step.id === "02-2" || step.id === "04-1" || step.id === "05-2") {
    title = w("證據審核結果", "Evidence review");
    headers = [w("公司", "Company"), w("證明", "Evidence"), w("狀態", "Status"), w("審核回饋", "Review feedback")];
    const relevantContacts = step.id === "05-2" && step.data.kind === "outreach"
      ? new Set(step.data.contacts.map(c => companyKey(c.company))) : null;
    rows = view.proofStatus.filter(p => (!relevantContacts || relevantContacts.has(companyKey(p.company))) && (step.id === "02-2" || p.kind === "paid")).map(p => [
      p.company, p.kind === "paid" ? w("付款", "Payment") : w("合約", "Contract"),
      p.revoked ? w("已撤銷", "Revoked") : p.approved ? w("已通過", "Approved") : p.status === "rejected" ? w("未通過", "Rejected") : w("待審核", "Under review"), p.note,
    ]);
  } else if (step.id === "02-3" && step.data.kind === "organize") {
    const data = step.data;
    title = w("定價與成交條件", "Pricing and commercial terms");
    headers = [w("項目", "Item"), w("內容", "Details"), w("狀態", "Status")];
    rows = [["price", w("價格", "Price")], ["scope", w("試點範圍", "Pilot scope")], ["terms", w("成交條件", "Terms")]]
      .map(([key, label]) => [label, data.values[key] || "", confirmed(data.confirmed.includes(key))]);
  } else if (step.id === "03-1") {
    title = w("每週開發進度", "Weekly outreach progress");
    headers = [w("週次", "Week"), w("已聯絡／目標", "Contacts / target"), w("有效對話", "Valid conversations")];
    rows = view.weeks.slice(-4).map(week => [week.date, week.contacts + " / 20", String(week.conversations)]);
  } else if (step.id === "03-2" && step.data.kind === "organize") {
    const selected = step.data.selections;
    title = w("管道成效排名", "Channel performance");
    headers = [w("管道", "Channel"), w("回覆率", "Reply rate"), w("對話率", "Conversation rate"), w("成交率", "Conversion rate"), w("保留", "Retained")];
    rows = view.channels.map(c => [c.channel, percent(c.reply, c.total), percent(c.conversation, c.total), percent(c.paid, c.total), selected.includes(c.channel) ? w("是", "Yes") : "—"]);
  } else if (step.data.kind === "document") {
    const data = step.data;
    title = step.id === "05-3" ? w("市場驗證報告", "Market validation report") : w("手冊章節進度", "Playbook progress");
    headers = [w("章節", "Chapter"), w("狀態", "Status")];
    rows = (CHAPTERS[step.id] || []).map((label, i) => [words(label, locale), confirmed(Boolean(data.sections.find(s => s.id === String(i))?.confirmed))]);
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
    <TaskSection number="03" title={title} detail={step.id === "05-3" && step.done ? view.reportCode : undefined} />
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
