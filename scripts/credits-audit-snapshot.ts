import { createHash } from "node:crypto";
import { createRequire } from "node:module";

export type AuditRow = Record<string, unknown>;
export const auditColumns = {
  User: 'id,email,"firstName","lastName",plan,"subscriptionStatus","paypalSubscriptionId","currentPeriodEnd","planUpdatedAt","rollonMember","trialPlan","trialStartsAt","trialEndsAt","trialPolicy","founderStartedAt","founderEndsAt","featurePolicy","createdAt"',
  Subscription: 'id,"userId","paypalSubscriptionId",plan,status,"startedAt","currentPeriodEnd","billingInterval",currency,"amountMinor"',
  AiAllowance: '"userId","cycleStart","cycleEnd","includedUsed","includedReserved","bonusBalance","rewardBalance"',
  AiUsage: 'id,"userId",source,status,"cycleStart","expiresAt","createdAt","completedAt"',
  AiCreditPurchase: 'id,"userId",status,credits,"amountMinor",currency,"completedAt",("paypalCaptureId" IS NOT NULL) AS "hasCapture"',
  RewardAccount: '"userId",balance', RewardEntry: 'id,"userId","eventKey",kind,points,"createdAt"',
  RewardRedemption: 'id,"userId","requestId",points,credits,"createdAt"',
  ReferralAccount: 'id,"userId",debt', ReferralEntry: 'id,"accountId","referralId",kind,credits,"offset","debtDelta","createdAt"',
  TokenWallet: '"userId",available,reserved', TokenLedger: 'id,"userId","eventKey",kind,"availableDelta","reservedDelta","reservationId","createdAt"',
  TokenReservation: 'id,"userId",kind,"resourceId","resourceVersion",amount,status,"expiresAt","createdAt",metadata->\'pricing\' AS pricing',
  NetworkConnection: 'id,"senderId","recipientId",status,revision',
  ProspectingOrder: 'id,"userId",status,count,"deliveredCount","reservedCount",period,poc,"submittedAt","leaseUntil",("providerOrderId" IS NOT NULL) AS "hasReceipt"',
  LegacyFeatureGrant: 'id,"userId",feature,"sourceKey"',
  TrialFeedbackGrant: '"userId","trialStartsAt","originalEndsAt","grantedEndsAt","aiCycleStart","aiCycleEnd","createdAt"',
  FounderOrder: 'id,"userId",status,"paidAt","accessEndsAt","revokedAt",seat,("paypalCaptureId" IS NOT NULL) AS "hasCapture"',
  MatchmakingProfile: '"userId",role,roles,verified', MentorCertification: '"userId",status',
} as const;
export type AuditTable = keyof typeof auditColumns;
export type AuditDataset = { asOf: string; tables: Record<AuditTable, AuditRow[]>; settings: AuditRow[]; localWalletKeys: string[] };
export type SnapshotProof = { readOnly: string; isolation: string; snapshot: string; asOf: string; fingerprints: AuditRow[]; sourceFingerprint: string; transactionWrites: number; rolledBack: boolean };

export async function collectAuditSnapshot<T>(connectionString: string, audit: (data: AuditDataset) => Promise<T>) {
  const require = createRequire(import.meta.url), pg = createRequire(require.resolve("@prisma/adapter-pg"))("pg");
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15000, application_name: "nova_credits_readonly_audit" });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL lock_timeout = '3s'");
    const info = (await client.query("SELECT current_setting('transaction_read_only') AS readonly, current_setting('transaction_isolation') AS isolation, txid_current_snapshot()::text AS snapshot, transaction_timestamp() AS at")).rows[0];
    if (info.readonly !== "on" || info.isolation !== "repeatable read") throw new Error("Database did not enable the required read-only snapshot");
    const fingerprintsSql = Object.keys(auditColumns).map(table => `SELECT '${table}' AS name,count(*)::int AS count,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS hash FROM "${table}" t`).join(" UNION ALL ") + " ORDER BY name";
    const before = (await client.query(fingerprintsSql)).rows;
    const tables = {} as AuditDataset["tables"];
    for (const table of Object.keys(auditColumns) as AuditTable[]) tables[table] = (await client.query(`SELECT ${auditColumns[table]} FROM "${table}"`)).rows;
    const settings = (await client.query('SELECT key,value FROM "Setting" WHERE key IN (\'billing.betaAccess\',\'novaCommerce.published\')')).rows;
    const localWalletKeys = (await client.query('SELECT key FROM "Setting" WHERE key LIKE \'localCredits.v1:%\'')).rows.map((r: AuditRow) => String(r.key));
    const asOf = new Date(info.at).toISOString();
    const data: AuditDataset = { asOf, tables, settings, localWalletKeys };
    const inputHash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
    const result = await audit(data);
    if (inputHash !== createHash("sha256").update(JSON.stringify(data)).digest("hex")) throw new Error("The simulation changed its immutable source snapshot");
    const after = (await client.query(fingerprintsSql)).rows;
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Snapshot fingerprints changed");
    const writes = Number((await client.query("SELECT COALESCE(sum(n_tup_ins+n_tup_upd+n_tup_del),0)::int AS writes FROM pg_stat_xact_user_tables")).rows[0].writes);
    if (writes !== 0) throw new Error("Unexpected writes detected in audit transaction");
    await client.query("ROLLBACK");
    const proof: SnapshotProof = { readOnly: info.readonly, isolation: info.isolation, snapshot: info.snapshot, asOf, fingerprints: before, sourceFingerprint: inputHash, transactionWrites: writes, rolledBack: true };
    return { result, proof };
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}
