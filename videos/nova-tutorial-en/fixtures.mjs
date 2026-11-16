import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { flowActions, flowMilestones, STEPS, STEP_TARGETS } from '../../src/lib/action-plan/flow/catalog.ts';
import { localDatabase } from './common.mjs';

export const day = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
export function database(url) {
  localDatabase(url);
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

export async function seed(url, password) {
  const db = database(url), users = {};
  assert.equal(await db.user.count(), 0, 'Never seed an existing member database');
  const passwordHash = await bcrypt.hash(password, 10), start = new Date(day(1)), end = new Date(day(-30));
  for (const [key, firstName, lastName, role] of [
    ['new', 'Alex', 'Morgan', 'founder'], ['member', 'Alex', 'Morgan', 'founder'],
    ['mentor', 'Taylor', 'Chen', 'mentor'], ['peer', 'Jordan', 'Lee', 'partner'],
    ['complete', 'Casey', 'Rivera', 'founder'], ['investor', 'Sam', 'Parker', 'investor'],
    ['buyer', 'Jamie', 'Wu', 'buyer'],
  ]) {
    users[key] = await db.user.create({ data: {
      email: `tutorial-${key}@example.invalid`, passwordHash, firstName, lastName,
      completed: key !== 'new', onboardingStep: key === 'new' ? 2 : 4, quizCompleted: true,
      plan: 'free', ...(key === 'new' ? {} : { trialPlan: 'business', trialStartsAt: start, trialEndsAt: end }),
      gettingStartedCompletedAt: start,
      profile: { create: { companyName: key === 'new' ? '' : (key === 'mentor' ? 'Clear Path Advisory' : 'Northstar Studio'), industry: 'saas', companySize: '1-10', country: 'TW', oneLinePitch: 'Weekly reporting for small operations teams', companyStage: 'Validation', primaryNeed: 'paying-customers', targetMarkets: ['TW'], needs: [] } },
      matchmakingProfile: { create: { displayName: `${firstName} ${lastName}`, role, ...(key==='peer'?{roles:['founder','partner']}:{}), categories: ['collaboration'], country: 'TW', industry: 'saas', slogan: 'Turn customer evidence into clear decisions', offers: 'Customer research and product experience', looksFor: 'Founders, mentors and operations teams', visibleFields: ['country', 'industry', 'companyPitch', 'offers', 'looksFor'], visible: true, sourcePolicy: 2, optedInAt: start, lastActiveAt: start } },
      rewardAccount: { create: { balance: 200 } }, tokenWallet: { create: { available: 500 } },
      referralAccount: { create: { code: `DEMO${key.toUpperCase()}` } },
    } });
  }
  await db.mentorCertification.create({ data: { userId: users.mentor.id, status: 'approved', draft: { publicName: 'Taylor Chen', bio: 'Synthetic mentor profile for the NOVA tutorial.', expertise: 'Customer interviews and evidence-based validation', references: ['https://example.com/mentor'], languages: ['en'], industries: ['all'] }, note: 'Pre-approved tutorial fixture; no real certification granted.' } });
  const connection = await db.networkConnection.create({ data: { pairKey: [users.member.id, users.peer.id].sort().join(':'), senderId: users.peer.id, recipientId: users.member.id, status: 'accepted', acceptedAt: start, messages: { create: { senderId: users.peer.id, requestId: randomUUID(), body: 'Thanks for connecting. What customer evidence are you working on?' } } } });
  const monday = new Date(day(0)); monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  await db.memberVisit.create({ data: { viewerId: users.investor.id, ownerId: users.member.id, week: monday.toISOString().slice(0,10), role: 'investor', identityConsentAt: start, identifiedAt: start } });
  const session = async (topic, days) => db.roundtable.create({ data: { hostId: users.mentor.id, topic, description: 'Bring one customer question and a short summary of your evidence.', steps: ['01-1'], industry: 'all', languages: ['en'], startsAt: new Date(Date.now() + days * 86400000), endsAt: new Date(Date.now() + days * 86400000 + 3600000), timezone: 'Asia/Taipei', capacity: 6, registrationMode: 'approval', meetingUrl: 'https://example.com/tutorial-meeting', requestId: randomUUID(), requestHash: randomUUID() } });
  const upcoming = await session('Customer evidence clinic · DEMO', 3), past = await session('Previous evidence clinic · PRELOADED DEMO', -2);
  const pastRegistration = await db.roundtableRegistration.create({ data: { roundtableId: past.id, userId: users.member.id, name: 'Alex Morgan', question: 'How can I improve my customer interviews?', status: 'confirmed', approvedAt: start, consentAt: start } });
  for (const key of ['member', 'mentor', 'complete']) users[key].planId = await seedPlan(db, users[key].id, key === 'complete');
  await db.$disconnect();
  return { users: Object.fromEntries(Object.entries(users).map(([key, u]) => [key, { id: u.id, email: u.email, planId: u.planId }])), connectionId: connection.id, upcomingId: upcoming.id, pastId: past.id, pastRegistrationId: pastRegistration.id };
}

async function seedPlan(db, userId, completed) {
  const diagnosis = { companyStage: 'MVP', stageReason: 'Preloaded fictional tutorial evidence', stageConfidence: 70, bottleneckGroup: 'Sales', bottleneckCode: 'no_leads', bottleneckReason: 'Validate buyer demand', bottleneckConfidence: 65 };
  const plan = await db.actionPlan.create({ data: { userId, activeKey: userId, locale: 'en', ...diagnosis, requestId: randomUUID(), goal: 'Validate demand and build repeat customers', goalStartsAt: new Date(day(42)), goalDeadline: new Date(day(-320)), goalAssumptions: ['All tutorial records are fictional.'] } });
  const milestones = await Promise.all(flowMilestones(day(42), day(-320), 'en').map((m, position) => db.planMilestone.create({ data: { ...m, targetDate: new Date(m.targetDate), actionPlanId: plan.id, position, ...(completed ? { achievedAt: new Date(day(0)), outcomeNote: 'Preloaded completed tutorial progress' } : {}) } })));
  const records = Array.from({ length: 10 }, (_, i) => ({ id: 'person-' + i, company: 'Demo Operations ' + (i + 1), name: 'Contact ' + (i + 1), date: day(42), relationship: 'prospect', fit: 'yes', pain: 'Manual weekly reporting takes too long', severity: 'high', solution: 'Spreadsheets', wtp: i < 6 ? 'willing' : 'considering', reason: '', missing: '', referral: '' }));
  const criteria = ['Needs weekly reporting', 'High pain severity', 'Existing workaround', 'Willing to try a paid pilot'].map((label, i) => ({ id: 'c' + i, label, weight: 25, sources: records.slice(0, 6).map(r => r.id), confirmed: true }));
  const empty = () => ({ kind: 'organize', values: {}, confirmed: [], criteria: [], tiers: [], selections: [] });
  const positioning = 'Help small teams reduce manual weekly reporting.';
  const contact = (id, company, i = 0) => ({ id, company, name: 'Contact ' + (i + 1), leadId: '', date: day(7), channel: i % 2 ? 'LinkedIn' : 'Email', status: 'sent', offer: 'Reporting pilot: USD 100 for fourteen days, weekly reports and a review.', matches: criteria.map(c => c.id), pain: records[0].pain, solution: records[0].solution, wtp: 'willing' });
  const document = bodies => ({ kind: 'document', sections: bodies.map((body, i) => ({ id: String(i), body, confirmed: true })) });
  const states = {
    '01-1': { kind: 'conversation', market: 'TW', records: completed ? records : records.slice(0, 9) },
    '01-2': { ...empty(), values: { positioning, positioningMode: 'direct', positioningWho: 'Small teams needing weekly reports', positioningWhen: 'When compiling weekly data', positioningPain: records[0].pain, positioningMethod: 'Consistent reports from customer records' }, confirmed: ['positioning'] },
    '01-3': { ...empty(), criteria }, '01-4': { ...empty(), tiers: records.map((r,i) => ({ leadId: r.id, matches: i < 3 ? criteria.map(c => c.id) : ['c0'], override: '', reason: '', confirmed: true })) },
    '02-1': { kind: 'outreach', market: 'TW', contacts: records.slice(0,3).map((r,i) => ({ ...contact('proposal-'+i,r.company,i), leadId:r.id,name:r.name,date:day(42) })) },
    '02-2': { kind: 'document', sections: [] },
    '02-3': { ...empty(), values: { price: 'USD 100', scope: 'Fourteen-day reporting pilot', terms: 'Payment before starting; review at completion' }, confirmed: ['price','scope','terms'] },
    '03-1': { kind: 'outreach', market: 'TW', contacts: Array.from({length:80},(_,i) => ({ ...contact('outreach-'+i,'Outreach company '+(i+1),i),date:day(35-Math.floor(i/20)*7),status:i%20<3?'conversation':'sent' })) },
    '03-2': { ...empty(), selections: ['Email','LinkedIn'], confirmed: ['channels'] },
    '03-3': document(['Qualify companies with confirmed criteria, using Email and LinkedIn.', 'Reference the customer problem and explain the pilot scope and price.', 'Ask about the latest problem, current workaround, impact and willingness to pay.', 'Confirm scope, send a proposal, and schedule delivery after payment.']),
    '04-1': { kind:'outreach',market:'TW',contacts:records.slice(0,5).map((r,i)=>({...contact('paid-'+i,r.company,i),leadId:r.id,status:'agreed'})) },
    '04-2': {kind:'conversation',market:'TW',records:records.slice(0,5).map(r=>({...r,date:day(2),reason:'Saves reporting time each week',missing:'Additional export format',referral:'Other operations teams'}))},
    '04-3': {...empty(),values:{currency:'USD',spend:'200'},selections:[records[0].company.toLowerCase()],confirmed:['renewal','revenue','cost']},
    '05-1': {...empty(),values:{target:'12000',conversion:'0.1'},confirmed:['target','activity','assumption']},
    '05-2': {kind:'outreach',market:'JP',contacts:Array.from({length:10},(_,i)=>({...contact('second-'+i,'Japan company '+(i+1),i),date:day(1),status:'conversation'}))},
    '05-3': document(['Ten fictional customer conversations support the confirmed needs and positioning.', 'Five fictional companies have pre-approved demonstration payment evidence.', 'Eighty fictional contacts over four weeks; Email and LinkedIn retained.', 'Weekly activity follows the quarterly target; this is preloaded demonstration progress.']),
  };
  const actions = flowActions(diagnosis, 'en'), ids = actions.map(() => randomUUID());
  for (const [i,a] of actions.entries()) {
    await db.actionItem.create({ data: { id:ids[i],actionPlanId:plan.id,clientKey:a.clientKey,title:a.title,milestoneId:milestones[STEPS[i].milestone].id,impact:a.impact,urgencyType:a.urgencyType,urgencyDays:a.urgencyDays,dependencyLevel:a.dependencyLevel,dependencyNotes:a.dependencyNotes,difficulty:a.difficulty,actionTimeMinHours:Math.ceil(a.actionTime.minMinutes/60),actionTimeMaxHours:Math.ceil(a.actionTime.maxMinutes/60),actionTimeMinMinutes:a.actionTime.minMinutes,actionTimeMaxMinutes:a.actionTime.maxMinutes,companyStage:a.companyStage,stageFit:a.stageFit.score,stageFitReason:a.stageFit.reason,stageFitConfidence:a.stageFit.confidence,bottleneckGroup:a.bottleneckGroup,bottleneckCode:a.bottleneckCode,bottleneckFit:a.bottleneckFit.score,bottleneckFitReason:a.bottleneckFit.reason,bottleneckFitConfidence:a.bottleneckFit.confidence,outcomeCategory:a.outcomeCategory,expectedOutcome:a.expectedOutcome,outcomeTimeMinDays:a.outcomeTime.min,outcomeTimeMaxDays:a.outcomeTime.max,executionOrder:i,metricCurrent:completed?STEP_TARGETS[STEPS[i].id]:0,metricTarget:STEP_TARGETS[STEPS[i].id],metricUnit:'verified records',taskWorkspace:{version:2,step:STEPS[i].id,data:states[STEPS[i].id]},...(STEPS[i].id==='01-2'?{taskFinding:{positioningVersion:'tutorial-v1',responses:records.slice(0,5).map(r=>({version:'tutorial-v1',leadId:r.id,statement:positioning,answer:'yes',at:new Date().toISOString()}))}}:{}),done:completed,completedAt:completed?new Date(day(42)):null } });
  }
  await db.actionDependency.createMany({data:ids.slice(1).map((id,i)=>({actionId:id,dependsOnId:ids[i]}))});
  if (completed) for (const [company,offset] of [...records.slice(0,5).map((r,i)=>[r.company,i?7:14]),[records[0].company,1],['Japan company 1',1]]) {
    const id=randomUUID();
    await db.deal.create({data:{userId,title:company,stage:'won',validation:{scope:{planId:plan.id},company,name:'Fictional buyer',version:1,status:'paid',events:[],proofs:[{id,kind:'paid',amount:'100',currency:'USD',date:day(offset),pathname:`commercial-evidence/${userId}/${id}.pdf`,filename:'preloaded-demo-evidence.pdf',confirmed:true,review:{status:'approved',note:'Preloaded fictional tutorial evidence'}}]}}});
  }
  return plan.id;
}
