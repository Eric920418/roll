import { companyKey } from "@/lib/customer-insights/interviews";
import { today } from "@/lib/roadmap/schema";
import { STEPS, CHAPTERS, emptyFlowData, emptyRecord, emptyContact, flowStoredSchema, flowStep, words, type FlowData, type StepId } from "./catalog";

export type FlowAction = { id: string; clientKey: string; done: boolean; completedAt: Date | string | null; taskWorkspace: unknown; taskFinding: unknown };
export type FlowProof = { id: string; company: string; name: string; kind: "signed" | "paid"; amount: string; currency: string; date: string; approved: boolean; revoked: boolean; reviewStatus?: "pending" | "approved" | "rejected"; reviewNote?: string };
export type FlowContext = { actions: FlowAction[]; proofs: FlowProof[]; locale: string; now?: Date };
export type Confirmation = { version: string; leadId: string; statement: string; answer: "yes" | "no"; at: string };
export function storedData(action?: FlowAction) { return flowStoredSchema.safeParse(action?.taskWorkspace).data?.data; }
export function dataAt(context: FlowContext, step: StepId) { return storedData(context.actions.find(a => flowStep(a)?.id === step)) || emptyFlowData(STEPS.find(s => s.id === step)!.kind); }
export function records(context: FlowContext) { const data = dataAt(context, "01-1"); return data.kind === "conversation" ? data.records : []; }
export function criteria(context: FlowContext) { const data = dataAt(context, "01-3"); return data.kind === "organize" ? data.criteria : []; }
export function score(context: FlowContext, matches: string[]) {
  const usable = criteria(context).filter(c => c.confirmed && new Set(c.sources).size >= 3);
  const total = usable.reduce((sum, c) => sum + c.weight, 0);
  return total ? Math.round(100 * usable.filter(c => matches.includes(c.id)).reduce((sum, c) => sum + c.weight, 0) / total) : 0;
}
export function tiers(context: FlowContext) {
  const data = dataAt(context, "01-4");
  return data.kind === "organize" ? data.tiers.map(t => { const value = score(context, t.matches); return { ...t, score: value, tier: t.override || (value >= 80 ? "A" : value >= 60 ? "B" : "C") }; }) : [];
}
export function approvedProofs(context: FlowContext, paidOnly = false) {
  return context.proofs.filter(p => !p.revoked && p.approved && (!paidOnly || p.kind === "paid"));
}
export function paidCompanies(context: FlowContext) { return [...new Map(approvedProofs(context, true).map(p => [companyKey(p.company), p])).values()]; }
export function channels(context: FlowContext) {
  const data = dataAt(context, "03-1"), paid = new Set(approvedProofs(context).map(p => companyKey(p.company)));
  if (data.kind !== "outreach") return [];
  return [...new Set(data.contacts.filter(c => c.status !== "draft" && c.channel).map(c => c.channel))].map(channel => {
    const rows = data.contacts.filter(c => c.channel === channel && c.status !== "draft");
    const total = new Set(rows.map(c => companyKey(c.company))).size;
    const count = (predicate: (c: typeof rows[number]) => boolean) => new Set(rows.filter(predicate).map(c => companyKey(c.company))).size;
    return { channel, total, reply: count(c => ["replied", "conversation", "agreed"].includes(c.status)), conversation: count(c => c.status === "conversation"), paid: count(c => paid.has(companyKey(c.company))) };
  }).sort((a, b) => b.paid / b.total - a.paid / a.total || b.conversation / b.total - a.conversation / a.total || b.reply / b.total - a.reply / a.total || a.channel.localeCompare(b.channel));
}
export function customerMetrics(context: FlowContext) {
  const data = dataAt(context, "04-3");
  const values = data.kind === "organize" ? data.values : {}, eligible = data.kind === "organize" ? new Set(data.selections) : new Set<string>();
  const proofs = approvedProofs(context, true).filter(p => p.currency === values.currency);
  const companies = [...new Set(proofs.map(p => companyKey(p.company)))];
  const renewed = companies.filter(c => eligible.has(c) && new Set(proofs.filter(p => companyKey(p.company) === c).map(p => p.date)).size >= 2).length;
  const revenue = proofs.reduce((sum, p) => sum + Math.round(Number(p.amount) * 100), 0) / 100;
  return { currency: values.currency || "", customers: companies.length, eligible: eligible.size, renewed, renewalRate: eligible.size ? renewed / eligible.size : null, averageRevenue: companies.length ? revenue / companies.length : 0, acquisitionCost: companies.length && values.spend !== "" && Number.isFinite(Number(values.spend)) ? Number(values.spend) / companies.length : null, revenue };
}
export function weeklyTarget(context: FlowContext) {
  const data = dataAt(context, "05-1"), metrics = customerMetrics(context);
  const values = data.kind === "organize" ? data.values : {}, channelRows = channels(context);
  const contacts = channelRows.reduce((s, c) => s + c.total, 0), conversations = channelRows.reduce((s, c) => s + c.conversation, 0), won = channelRows.reduce((s, c) => s + c.paid, 0);
  const conversion = values.conversion ? Number(values.conversion) : contacts ? won / contacts : 0, conversationRate = contacts ? conversations / contacts : 0;
  const weeklyContacts = metrics.averageRevenue && conversion > 0 ? Math.ceil(Number(values.target) / metrics.averageRevenue / conversion / 13) : 0;
  return { currency: metrics.currency, target: Number(values.target) || 0, conversion, assumed: Boolean(values.conversion), weeklyContacts, weeklyConversations: Math.ceil(weeklyContacts * conversationRate) };
}
function week(date: string) {
  const day = new Date(date + "T00:00:00Z"), offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset); return day.toISOString().slice(0, 10);
}
function completedText(text: string) { return text.trim().length >= 3 && !/\[[^\]]+\]|待補|TBD|TODO/i.test(text); }
function unique(values: string[]) { return new Set(values).size === values.length; }
export function evaluateStep(context: FlowContext, step: StepId, override?: FlowData) {
  const data = override || dataAt(context, step), spec = STEPS.find(s => s.id === step)!;
  const w = (zh: string, en: string) => context.locale === "zh-tw" ? zh : en;
  const reasons: string[] = [], summary: string[] = [];
  let current = 0, target = 1;
  const require = (condition: unknown, zh: string, en: string) => { if (!condition) reasons.push(w(zh, en)); };
  if (data.kind !== spec.kind) return { ready: false, current, target, reasons: [w("表單類型不符", "Wrong template")], summary };
  const first = records(context), ids = new Set(first.map(r => r.id)), cs = criteria(context), cids = new Set(cs.map(c => c.id));
  const day = today(context.now), proof = approvedProofs(context);
  const aIds = new Set(tiers(context).filter(t => t.confirmed && t.tier === "A").map(t => t.leadId));
  const dateValid = (value: string) => Boolean(value && value <= day);
  if (data.kind === "conversation") {
    require(unique(data.records.map(r => r.id)) && unique(data.records.map(r => companyKey(r.company) + "|" + companyKey(r.name))), "對象不能重複", "Conversation participants must be distinct");
    if (step === "01-1") {
      target = 10;
      current = new Set(data.records.filter(r => r.company && r.name && r.relationship && r.pain && r.severity && r.solution && r.wtp && r.wtp !== "not_asked" && dateValid(r.date)).map(r => companyKey(r.company) + "|" + companyKey(r.name))).size;
      require(data.market, "請選擇原市場", "Choose the original market");
    } else {
      target = 5; const paid = new Set(paidCompanies(context).map(p => companyKey(p.company)));
      current = new Set(data.records.filter(r => paid.has(companyKey(r.company)) && r.name && r.reason && r.missing && r.referral && dateValid(r.date) && approvedProofs(context, true).some(p => companyKey(p.company) === companyKey(r.company) && p.date <= r.date)).map(r => companyKey(r.company))).size;
    }
    require(current >= target, "完整有效對話不足 " + current + "/" + target, "Not enough complete conversations: " + current + "/" + target);
  }
  if (data.kind === "organize") {
    require(unique(data.confirmed) && unique(data.selections), "確認項目不能重複", "Duplicate confirmations or selections");
    if (step === "01-2") {
      const action = context.actions.find(a => flowStep(a)?.id === step), raw = action?.taskFinding as { responses?: Confirmation[]; positioningVersion?: string } | null;
      current = new Set((raw?.responses || []).filter(r => r.version === raw?.positioningVersion && r.statement === data.values.positioning && r.answer === "yes" && ids.has(r.leadId)).map(r => r.leadId)).size; target = 5;
      require(completedText(data.values.positioning || "") && data.confirmed.includes("positioning"), "請完成並確認一句話定位", "Complete and confirm your positioning statement");
      require(current >= target, "等待 5 位受訪者透過連結確認，目前 " + current, "Waiting for five interviewee responses; currently " + current);
    }
    if (step === "01-3") {
      current = data.criteria.filter(c => completedText(c.label) && c.confirmed).length; target = data.criteria.length;
      require(data.criteria.length >= 4 && data.criteria.length <= 6 && current === target, "請確認 4–6 項評分條件", "Confirm 4–6 qualification criteria");
      require(unique(data.criteria.map(c => c.id)) && unique(data.criteria.map(c => companyKey(c.label))), "條件不能重複", "Criteria must be distinct");
      require(data.criteria.reduce((s, c) => s + c.weight, 0) === 100, "權重合計必須為 100%", "Weights must total 100%");
      require(data.criteria.every(c => unique(c.sources) && c.sources.every(id => ids.has(id))), "佐證須來自本計畫對話", "Sources must be conversations in this plan");
      summary.push(w("少於 3 份佐證的條件只作觀察，不計入分數。", "Criteria with fewer than three sources are observations and do not score."));
    }
    if (step === "01-4") {
      current = data.tiers.filter(t => t.confirmed && ids.has(t.leadId)).length; target = first.length;
      require(first.length >= 10 && current === target && unique(data.tiers.map(t => t.leadId)) && data.tiers.length === target, "請完成全部受訪者分級", "Tier every interviewee");
      require(data.tiers.every(t => unique(t.matches) && t.matches.every(id => cids.has(id)) && (!t.override || completedText(t.reason))), "分級條件無效或手動調整缺少理由", "Invalid criterion or missing override reason");
      const next = { ...context, actions: context.actions.map(a => flowStep(a)?.id === step ? { ...a, taskWorkspace: { version: 2, step, data } } : a) };
      require(tiers(next).filter(t => t.confirmed && t.tier === "A").length >= 3, "至少需要 3 位 A 級客戶", "At least three A leads are required");
    }
    if (step === "02-3") {
      target = 3; current = ["price", "scope", "terms"].filter(k => completedText(data.values[k] || "") && data.confirmed.includes(k)).length;
      require(current === target, "請確認價格、範圍與成交條件", "Confirm price, scope and commercial terms");
    }
    if (step === "03-2") {
      const available = new Set(channels(context).map(c => c.channel)); target = 2; current = data.selections.filter(c => available.has(c)).length;
      require(current === 2 && data.selections.length === 2 && data.confirmed.includes("channels"), "請確認保留 2 個有實際紀錄的管道", "Confirm two channels with actual records");
    }
    if (step === "04-3") {
      const next = { ...context, actions: context.actions.map(a => flowStep(a)?.id === step ? { ...a, taskWorkspace: { version: 2, step, data } } : a) }, metrics = customerMetrics(next);
      const paid = new Set(approvedProofs(context, true).filter(p => p.currency === data.values.currency).map(p => companyKey(p.company)));
      require(/^[A-Z]{3}$/.test(data.values.currency || "") && metrics.customers > 0, "請選擇有付款證據的幣別", "Choose a currency with approved payments");
      require(data.values.spend !== "" && Number.isFinite(Number(data.values.spend)) && Number(data.values.spend) >= 0, "行銷支出須為非負數", "Marketing spend must be a nonnegative number");
      require(data.selections.every(c => paid.has(c)), "到期客戶須來自所選幣別的付款公司", "Renewal-eligible customers must have paid in the selected currency");
      current = ["renewal", "revenue", "cost"].filter(c => data.confirmed.includes(c)).length; target = 3;
      require(current === target, "請確認三項計算結果；沒有到期客戶時續約率列為不適用", "Confirm three metrics; no renewal-eligible customers means the renewal rate is not applicable");
    }
    if (step === "05-1") {
      const next = { ...context, actions: context.actions.map(a => flowStep(a)?.id === step ? { ...a, taskWorkspace: { version: 2, step, data } } : a) }, weekly = weeklyTarget(next);
      require(weekly.target > 0 && weekly.target <= 1e12 && Number.isFinite(weekly.target) && weekly.conversion > 0 && weekly.conversion <= 1 && weekly.weeklyContacts > 0 && weekly.weeklyContacts <= 1000000, "需有正數目標、有效轉換率與客單價", "A positive target, valid conversion and customer revenue are required");
      current = ["target", "activity"].filter(c => data.confirmed.includes(c)).length; target = 2;
      require(current === target && (!data.values.conversion || data.confirmed.includes("assumption")), "請確認目標、開發量及調整的轉換率假設", "Confirm the target, activity and any conversion assumption");
    }
  }
  if (data.kind === "outreach") {
    require(unique(data.contacts.map(c => c.id)), "聯絡識別碼不能重複", "Duplicate contact IDs");
    const sent = data.contacts.filter(c => c.company && c.name && c.channel && completedText(c.offer) && c.status !== "draft" && dateValid(c.date));
    if (step === "02-1") {
      current = new Set(sent.filter(c => aIds.has(c.leadId) && first.some(r => r.id === c.leadId && companyKey(r.company) === companyKey(c.company)) && completedText(c.offer)).map(c => c.leadId)).size; target = 3;
      require(current >= target, "須向 3 位本計畫 A 級客戶實際寄出提案", "Send proposals to three A leads from this plan");
    }
    if (step === "03-1") {
      const previous = context.actions.find(a => flowStep(a)?.id === "02-3"), since = previous?.completedAt ? today(new Date(previous.completedAt)) : day;
      const qualified = sent.filter(c => c.date >= since && score(context, c.matches) >= 60 && unique(c.matches) && c.matches.every(id => cids.has(id)));
      const seen = new Set<string>(), weeks = new Map<string, typeof qualified>();
      for (const row of [...qualified].sort((a, b) => a.date.localeCompare(b.date))) {
        const key = companyKey(row.company); if (seen.has(key)) continue; seen.add(key);
        const start = week(row.date); weeks.set(start, [...(weeks.get(start) || []), row]);
      }
      let bestContacts = 0, bestConversations = 0, valid = false;
      for (const start of [...weeks.keys()].sort()) {
        const slots = Array.from({ length: 4 }, (_, i) => { const d = new Date(start); d.setUTCDate(d.getUTCDate() + i * 7); return d.toISOString().slice(0, 10); });

        const rows = slots.flatMap(s => weeks.get(s) || []), count = rows.filter(c => c.status === "conversation" && c.pain && c.solution && c.wtp && c.wtp !== "not_asked").length;
        if (rows.length > bestContacts) { bestContacts = rows.length; bestConversations = count; }
        if (slots.every(s => (weeks.get(s)?.length || 0) >= 20) && count >= 12) valid = true;
      }
      current = bestContacts; target = 80;
      summary.push(w("最完整四週的有效對話：" + bestConversations, "Conversations in the strongest four-week window: " + bestConversations));
      require(valid, "尚未達連續 4 週、每週 20 家與至少 12 次對話", "Four consecutive weeks, 20 companies each and 12 conversations are required");
    }
    if (step === "04-1") {
      current = paidCompanies(context).length; target = 5;
      require(current >= target, "審核通過的付款公司不足 5 家，目前 " + current, "Five approved paying companies are required; currently " + current);
    }
    if (step === "05-2") {
      const original = dataAt(context, "01-1");
      require(data.market && original.kind === "conversation" && companyKey(data.market) !== companyKey(original.market), "請選擇與原市場不同的市場", "Choose a market different from your original market");
      const conversations = new Set(sent.filter(c => c.status === "conversation" && c.pain && c.solution && c.wtp && c.wtp !== "not_asked").map(c => companyKey(c.company)));
      current = conversations.size; target = 10;
      const openedAt = context.actions.find(a => flowStep(a)?.id === "05-1")?.completedAt;
      const since = openedAt ? today(new Date(openedAt)) : day;
      require(current >= target && proof.some(p => p.kind === "paid" && p.date >= since && conversations.has(companyKey(p.company))), "新市場須有 10 家對話與至少 1 家在本步開啟後付款、且審核通過的公司", "The new market requires ten company conversations and an approved payment after this step opens");
    }
  }
  if (data.kind === "document") {
    if (step === "02-2") {
      const proposals = dataAt(context, "02-1"), companies = new Set(proposals.kind === "outreach" ? proposals.contacts.filter(c => c.status !== "draft").map(c => companyKey(c.company)) : []);
      current = new Set(proof.filter(p => companies.has(companyKey(p.company))).map(p => companyKey(p.company))).size;
      require(current >= 1, "尚無提案客戶的審核通過付款／合約證明", "An approved payment or contract proof from a proposed customer is required");
    } else {
      target = 4; current = data.sections.filter(s => s.confirmed && completedText(s.body)).length;
      require(current === 4 && data.sections.length === 4 && unique(data.sections.map(s => s.id)) && data.sections.every(s => ["0", "1", "2", "3"].includes(s.id)), "請補齊並確認全部四章；不可保留待補內容", "Complete and confirm all four chapters; remove placeholders");
    }
  }
  summary.unshift(w("已核對有效成果：" + current + " / " + target, "Verified saved results: " + current + " / " + target));
  if (step === "01-1" && data.kind === "conversation") {
    const pains = new Map<string, number>();
    for (const row of data.records.filter(r => r.pain)) pains.set(row.pain, (pains.get(row.pain) || 0) + 1);
    summary.push(...[...pains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([pain, count]) => pain + " · " + count + w(" 次佐證", " sources")));
  }
  if (step === "01-3" && data.kind === "organize") summary.push(...data.criteria.map(c => c.label + " · " + c.sources.length + w(" 次佐證", " sources") + (c.sources.length < 3 ? w("（觀察）", " (observation)") : "")));
  if (step === "02-3" && data.kind === "organize") summary.push(...["price", "scope", "terms"].map(k => data.values[k] || ""));
  return { ready: reasons.length === 0, current, target, reasons, summary };
}
export function seedData(context: FlowContext, step: StepId): FlowData {
  const spec = STEPS.find(s => s.id === step)!, data = emptyFlowData(spec.kind), first = records(context);
  const w = (zh: string, en: string) => context.locale === "zh-tw" ? zh : en;
  if (data.kind === "organize") {
    if (step === "01-2" && first[0]) data.values.positioning = w("我們幫助", "We help ") + first.slice(0, 3).map(r => r.company).join("、") + w("，處理「", " address “") + first[0].pain + w("」，透過 [你的方法] 得到 [結果]。", "” using [your method] to achieve [outcome].");
    if (step === "01-3") data.criteria = [
      { label: w("痛點嚴重程度為高", "High pain severity"), sources: first.filter(r => r.severity === "high").map(r => r.id) },
      { label: w("明確有付費意願", "Explicit willingness to pay"), sources: first.filter(r => r.wtp === "willing").map(r => r.id) },
      { label: w("目前已有替代做法", "An existing workaround"), sources: first.filter(r => r.solution).map(r => r.id) },
      { label: first[0]?.pain || w("待補充的需求條件", "A demand criterion to complete"), sources: first.filter(r => r.pain === first[0]?.pain).map(r => r.id) },
    ].map((c, i) => ({ id: "criterion_" + i, ...c, weight: 25, confirmed: false }));
    if (step === "01-4") data.tiers = first.map(r => ({ leadId: r.id, matches: [], override: "", reason: "", confirmed: false }));
    if (step === "02-3") { const proof = approvedProofs(context)[0], proposals = dataAt(context, "02-1"); data.values = { price: proof ? proof.currency + " " + proof.amount : "", scope: proposals.kind === "outreach" ? proposals.contacts.find(c => c.status !== "draft")?.offer || "" : "", terms: "" }; }
    if (step === "04-3") data.values = { currency: approvedProofs(context, true)[0]?.currency || "", spend: "" };
    if (step === "05-1") data.values = { target: "", conversion: "" };
  }
  if (data.kind === "outreach" && ["02-1", "04-1"].includes(step)) {
    data.contacts = first.filter(r => tiers(context).some(t => t.leadId === r.id && t.tier === "A")).map(r => ({ ...emptyContact("proposal_" + r.id), company: r.company, name: r.name, leadId: r.id }));
    const original = dataAt(context, "01-1"); data.market = original.kind === "conversation" ? original.market : "";
  }
  if (data.kind === "conversation" && step === "04-2") data.records = paidCompanies(context).map((p, i) => ({ ...emptyRecord("review_" + i), company: p.company, name: p.name }));
  if (data.kind === "document" && CHAPTERS[step]) {
    const kept = dataAt(context, "03-2"), terms = dataAt(context, "02-3");
    const positioning = dataAt(context, "01-2"), proposals = dataAt(context, "02-1"), secondMarket = dataAt(context, "05-2");
    const statement = positioning.kind === "organize" ? positioning.values.positioning || "" : "";
    const firstProposal = proposals.kind === "outreach" ? proposals.contacts.find(c => c.status !== "draft")?.offer || "" : "";
    const financial = context.actions.find(a => flowStep(a)?.id === "04-3" && a.done)?.taskFinding as { outcome?: { metrics?: ReturnType<typeof customerMetrics> } } | null;
    const growth = context.actions.find(a => flowStep(a)?.id === "05-1" && a.done)?.taskFinding as { outcome?: { weekly?: ReturnType<typeof weeklyTarget> } } | null;
    const metrics = financial?.outcome?.metrics || customerMetrics(context), weekly = growth?.outcome?.weekly || weeklyTarget(context);
    const amounts = new Map<string, number>();
    for (const proof of approvedProofs(context, true)) amounts.set(proof.currency, (amounts.get(proof.currency) || 0) + Math.round(Number(proof.amount) * 100));
    const retained = kept.kind === "organize" ? kept.selections : [];
    const bodies = step === "03-3" ? [
      w("保留的名單管道：", "Retained lead channels: ") + retained.join("、") + "\n" + criteria(context).map(c => c.label + " · " + c.weight + "%").join("\n"),
      [statement, firstProposal].filter(Boolean).join("\n"),
      w("請回想最近一次遇到問題：目前怎麼處理、造成多少損失、由誰決定購買？接著確認付費意願與下一步。", "Ask about the last occurrence, current workaround, cost and buying decision. Then discuss willingness to pay and agree on the next step."),
      terms.kind === "organize" ? Object.values(terms.values).join("\n") : "",
    ] : [
      [statement, w("已保存對話：", "Saved conversations: ") + first.length, w("確認的評分條件：", "Confirmed qualification criteria: "), ...criteria(context).map(c => c.label + " · " + c.sources.length + w(" 份佐證", " sources")), w("A 級客戶：", "A leads: ") + tiers(context).filter(t => t.tier === "A").length].join("\n"),
      [w("目前有審核通過付款的公司：", "Companies with approved payments: ") + paidCompanies(context).length, ...[...amounts].map(([currency, cents]) => currency + " " + (cents / 100).toFixed(2)), w("已確認財務快照（現金支出）：", "Confirmed financial snapshot (cash spend): "), metrics.currency + " · " + w("平均客單價 ", "Revenue per customer ") + metrics.averageRevenue.toFixed(2) + " · " + w("取得成本 ", "Acquisition cost ") + (metrics.acquisitionCost?.toFixed(2) ?? "—"), w("續約率：", "Renewal rate: ") + (metrics.renewalRate === null ? w("無到期客戶，不適用", "N/A; no eligible customers") : Math.round(metrics.renewalRate * 100) + "%")].join("\n"),
      [w("保留管道：", "Retained channels: ") + retained.join("、"), ...channels(context).filter(c => retained.includes(c.channel)).map(c => c.channel + " · " + c.total + w(" 家聯絡；回覆／對話／成交率 ", " contacts; reply / conversation / conversion ") + [c.reply, c.conversation, c.paid].map(n => Math.round(n / c.total * 100) + "%").join(" / ")), w("開發手冊四章已確認，個別對話及私密附件不加入本報告。", "The four playbook chapters are confirmed. Individual conversations and private proof files are excluded.")].join("\n"),
      [w("季度營收目標：", "Quarterly revenue target: ") + weekly.currency + " " + weekly.target, w("每週聯絡／對話：", "Weekly contacts / conversations: ") + weekly.weeklyContacts + " / " + weekly.weeklyConversations + (weekly.assumed ? w("（轉換率為待驗證假設）", " (conversion is an unverified assumption)") : ""), w("已驗證第二市場：", "Validated second market: ") + (secondMarket.kind === "outreach" ? secondMarket.market : ""), w("[補充下一季度擴張計畫]", "[Add your next-quarter expansion plan]")].join("\n"),
    ];
    data.sections = CHAPTERS[step]!.map((_, i) => ({ id: String(i), body: bodies[i], confirmed: false }));
  }
  return data;
}
export function flowView(context: FlowContext) {
  return STEPS.map(spec => {
    const action = context.actions.find(a => flowStep(a)?.id === spec.id);
    const data = storedData(action) || seedData(context, spec.id);
    return { ...spec, title: words(spec.title, context.locale), criteria: words(spec.criteria, context.locale), guide: words(spec.guide, context.locale), actionId: action?.id || "", done: Boolean(action?.done), completedAt: action?.completedAt ? new Date(action.completedAt).toISOString() : null, data, saved: Boolean(storedData(action)), draft: seedData(context, spec.id), ...evaluateStep(context, spec.id, data) };
  });
}
