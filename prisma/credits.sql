-- Additive only. Apply with scripts/credits-ledger.ts against an explicitly isolated database.
CREATE TABLE "CreditControl" (
  id TEXT PRIMARY KEY CHECK (id = 'main'), "schemaVersion" INTEGER NOT NULL CHECK ("schemaVersion" = 1),
  mode TEXT NOT NULL CHECK (mode IN ('legacy','active','compatible')), "activatedAt" TIMESTAMPTZ
);
INSERT INTO "CreditControl" VALUES ('main',1,'legacy',NULL);
CREATE TABLE "CreditAccount" (
  id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK (status IN ('prepared','active','compatible','rolled_back','superseded','closed')),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0), "activationSequence" INTEGER,
  "sourceHash" TEXT NOT NULL, source JSONB NOT NULL, "importedCycle" TIMESTAMPTZ,
  "legacyMonthlyGrant" BIGINT NOT NULL CHECK ("legacyMonthlyGrant" BETWEEN 0 AND 1000000000000),
  earned BIGINT NOT NULL DEFAULT 0 CHECK (earned BETWEEN 0 AND 1000000000000),
  "referralDebt" BIGINT NOT NULL DEFAULT 0 CHECK ("referralDebt" BETWEEN 0 AND 1000000000000),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "activatedAt" TIMESTAMPTZ, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE "CreditAuthority" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE,
  "accountId" TEXT NOT NULL UNIQUE REFERENCES "CreditAccount"(id)
);
CREATE TABLE "CreditLot" (
  "accountId" TEXT NOT NULL REFERENCES "CreditAccount"(id), key TEXT NOT NULL, ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  origin TEXT NOT NULL CHECK (origin IN ('legacy_token','included','purchased','reward','referral','monthly','compensation','admin')),
  remaining BIGINT NOT NULL CHECK (remaining BETWEEN 0 AND 1000000000000), "expiresAt" TIMESTAMPTZ,
  PRIMARY KEY ("accountId",key), UNIQUE ("accountId",ordinal)
);
CREATE TABLE "CreditHold" (
  "accountId" TEXT NOT NULL REFERENCES "CreditAccount"(id), key TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount BETWEEN 1 AND 1000000000000),
  kind TEXT NOT NULL CHECK (kind IN ('ai','invite','search','adjustment')),
  status TEXT NOT NULL CHECK (status IN ('reserved','captured','refunded')), "expiresAt" TIMESTAMPTZ NOT NULL,
  PRIMARY KEY ("accountId",key)
);
CREATE TABLE "CreditAllocation" (
  "accountId" TEXT NOT NULL, "holdKey" TEXT NOT NULL, "lotKey" TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position > 0), amount BIGINT NOT NULL CHECK (amount BETWEEN 1 AND 1000000000000),
  PRIMARY KEY ("accountId","holdKey","lotKey"), UNIQUE ("accountId","holdKey",position),
  FOREIGN KEY ("accountId","holdKey") REFERENCES "CreditHold"("accountId",key),
  FOREIGN KEY ("accountId","lotKey") REFERENCES "CreditLot"("accountId",key)
);
CREATE TABLE "CreditEntry" (
  "accountId" TEXT NOT NULL REFERENCES "CreditAccount"(id), key TEXT NOT NULL, sequence INTEGER NOT NULL CHECK (sequence > 0),
  content TEXT NOT NULL, kind TEXT NOT NULL, reason TEXT NOT NULL, at TIMESTAMPTZ NOT NULL,
  "availableDelta" BIGINT NOT NULL, "reservedDelta" BIGINT NOT NULL, "earnedDelta" BIGINT NOT NULL, "debtDelta" BIGINT NOT NULL,
  PRIMARY KEY ("accountId",key), UNIQUE ("accountId",sequence),
  CHECK (abs("availableDelta") <= 1000000000000 AND abs("reservedDelta") <= 1000000000000 AND abs("earnedDelta") <= 1000000000000 AND abs("debtDelta") <= 1000000000000)
);
CREATE TABLE "CreditTransition" (
  key TEXT PRIMARY KEY, "accountId" TEXT REFERENCES "CreditAccount"(id), action TEXT NOT NULL,
  "contentHash" TEXT NOT NULL, actor TEXT NOT NULL, reason TEXT NOT NULL, result JSONB NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "CreditHold_pending" ON "CreditHold"("accountId",status,"expiresAt");
CREATE INDEX "CreditLot_expiry" ON "CreditLot"("accountId","expiresAt");

CREATE FUNCTION nova_credit_route(uid TEXT) RETURNS TEXT LANGUAGE SQL STABLE AS $$
  SELECT COALESCE((SELECT CASE a.status WHEN 'active' THEN 'active' WHEN 'compatible' THEN 'compatible'
    WHEN 'prepared' THEN CASE WHEN c.mode='legacy' THEN 'legacy' ELSE 'required' END ELSE 'legacy' END
    FROM "CreditAuthority" p JOIN "CreditAccount" a ON a.id=p."accountId" CROSS JOIN "CreditControl" c WHERE p."userId"=uid),
    (SELECT CASE WHEN mode='legacy' THEN 'legacy' ELSE 'required' END FROM "CreditControl" WHERE id='main'),'legacy')
$$;
CREATE FUNCTION nova_credit_legacy_fence() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE rowdata JSONB; olddata JSONB; uid TEXT; route TEXT; monetary TEXT[]; column_name TEXT;
BEGIN
  rowdata := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  olddata := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  IF TG_TABLE_NAME='ReferralEntry' THEN SELECT "userId" INTO uid FROM "ReferralAccount" WHERE id=rowdata->>'accountId';
  ELSE uid := rowdata->>'userId'; END IF;
  IF uid IS NULL THEN RETURN COALESCE(NEW,OLD); END IF;
  PERFORM 1 FROM "User" WHERE id=uid FOR UPDATE;
  IF NOT FOUND THEN RETURN COALESCE(NEW,OLD); END IF;
  route := nova_credit_route(uid);
  IF route='legacy' THEN RETURN COALESCE(NEW,OLD); END IF;
  monetary := CASE TG_TABLE_NAME WHEN 'TokenWallet' THEN ARRAY['available','reserved']
    WHEN 'RewardAccount' THEN ARRAY['balance'] WHEN 'ReferralAccount' THEN ARRAY['debt']
    WHEN 'AiAllowance' THEN ARRAY['includedUsed','includedReserved','bonusBalance','rewardBalance','cycleStart','cycleEnd'] ELSE NULL END;
  IF monetary IS NOT NULL THEN
    IF TG_OP='UPDATE' THEN
      FOREACH column_name IN ARRAY monetary LOOP
        IF rowdata->column_name IS DISTINCT FROM olddata->column_name THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CREDITS_LEGACY_FENCED: 舊餘額已封存，請使用相容點數版本 / Legacy balances are sealed; use the Credits-compatible release'; END IF;
      END LOOP;
      RETURN NEW;
    ELSIF TG_OP='INSERT' AND COALESCE((rowdata->>'available')::bigint,0)=0 AND COALESCE((rowdata->>'reserved')::bigint,0)=0
      AND COALESCE((rowdata->>'balance')::bigint,0)=0 AND COALESCE((rowdata->>'debt')::bigint,0)=0
      AND COALESCE((rowdata->>'includedUsed')::bigint,0)=0 AND COALESCE((rowdata->>'includedReserved')::bigint,0)=0
      AND COALESCE((rowdata->>'bonusBalance')::bigint,0)=0 AND COALESCE((rowdata->>'rewardBalance')::bigint,0)=0 THEN RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CREDITS_LEGACY_FENCED: 不得刪改封存餘額 / Sealed legacy balances cannot be removed';
  END IF;
  IF TG_TABLE_NAME='RewardEntry' AND TG_OP='INSERT' AND rowdata->>'points'='0' THEN RETURN NEW; END IF;
  IF current_setting('nova.credit_writer_user',true) IS DISTINCT FROM uid THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CREDITS_LEGACY_FENCED: 請更新相容帳務版本後重試 / Upgrade to the Credits-compatible release and retry';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['TokenWallet','AiAllowance','RewardAccount','RewardEntry','RewardRedemption','TokenLedger','TokenReservation','AiUsage','ReferralAccount','ReferralEntry'] LOOP
    EXECUTE format('CREATE TRIGGER credit_legacy_fence BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION nova_credit_legacy_fence()',table_name);
  END LOOP;
END $$;

CREATE FUNCTION nova_credit_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CREDITS_IMMUTABLE: 不得刪改點數收據 / Credits receipts are append-only';
END $$;
CREATE TRIGGER credit_entry_immutable BEFORE UPDATE OR DELETE ON "CreditEntry" FOR EACH ROW EXECUTE FUNCTION nova_credit_immutable();
CREATE TRIGGER credit_transition_immutable BEFORE UPDATE OR DELETE ON "CreditTransition" FOR EACH ROW EXECUTE FUNCTION nova_credit_immutable();
DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['CreditAccount','CreditLot','CreditHold','CreditAllocation'] LOOP
    EXECUTE format('CREATE TRIGGER credit_no_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION nova_credit_immutable()',table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['CreditAccount','CreditLot','CreditHold','CreditAllocation','CreditEntry','CreditTransition','CreditAuthority','CreditControl'] LOOP
    EXECUTE format('CREATE TRIGGER credit_no_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION nova_credit_immutable()',table_name);
  END LOOP;
END $$;
CREATE FUNCTION nova_credit_balanced() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE aid TEXT; a "CreditAccount"%ROWTYPE; av NUMERIC; rv NUMERIC; er NUMERIC; db NUMERIC; lastseq INTEGER; entries INTEGER;
BEGIN
  aid := CASE WHEN TG_TABLE_NAME='CreditAccount' THEN to_jsonb(NEW)->>'id' ELSE to_jsonb(NEW)->>'accountId' END;
  SELECT * INTO a FROM "CreditAccount" WHERE id=aid;
  SELECT COALESCE(sum("availableDelta"),0),COALESCE(sum("reservedDelta"),0),COALESCE(sum("earnedDelta"),0),COALESCE(sum("debtDelta"),0),COALESCE(max(sequence),0),count(*) INTO av,rv,er,db,lastseq,entries FROM "CreditEntry" WHERE "accountId"=aid;
  IF av <> (SELECT COALESCE(sum(remaining),0) FROM "CreditLot" WHERE "accountId"=aid)
    OR rv <> (SELECT COALESCE(sum(amount),0) FROM "CreditHold" WHERE "accountId"=aid AND status='reserved')
    OR er <> a.earned OR db <> a."referralDebt" OR lastseq <> a.version OR entries <> a.version
    OR EXISTS (SELECT 1 FROM "CreditHold" h WHERE h."accountId"=aid AND h.amount <> (SELECT COALESCE(sum(x.amount),0) FROM "CreditAllocation" x WHERE x."accountId"=aid AND x."holdKey"=h.key))
  THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CREDITS_UNBALANCED: 點數帳本或來源配置不平，交易已取消 / Credits ledger or allocations do not balance; transaction cancelled'; END IF;
  RETURN NULL;
END $$;
DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['CreditAccount','CreditLot','CreditHold','CreditAllocation','CreditEntry'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER credit_balanced AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION nova_credit_balanced()',table_name);
  END LOOP;
END $$;
CREATE FUNCTION nova_credit_close_owner() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
  IF EXISTS (SELECT 1 FROM "CreditAccount" WHERE id=OLD."accountId" AND status IN ('active','compatible'))
    AND EXISTS (SELECT 1 FROM "CreditHold" WHERE "accountId"=OLD."accountId" AND status='reserved') THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CREDITS_PENDING_HOLDS: 尚有預扣，請先完成或取消再刪除帳號 / Complete or cancel pending holds before deleting the account';
  END IF;
  UPDATE "CreditAccount" SET status='closed',"updatedAt"=now() WHERE id=OLD."accountId";
  INSERT INTO "CreditTransition"(key,"accountId",action,"contentHash",actor,reason,result) VALUES
    ('close:'||OLD."accountId",OLD."accountId",'close','account-deletion','account-owner','會員刪除帳號，匿名保留點數收據 / Account deleted; retain anonymous receipts','{}');
  RETURN OLD;
END $$;
CREATE TRIGGER credit_owner_deleted AFTER DELETE ON "CreditAuthority" FOR EACH ROW EXECUTE FUNCTION nova_credit_close_owner();
CREATE FUNCTION nova_credit_terms_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
  IF (TG_TABLE_NAME='CreditLot' AND (to_jsonb(NEW)-'remaining') IS DISTINCT FROM (to_jsonb(OLD)-'remaining'))
    OR (TG_TABLE_NAME='CreditHold' AND ((to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') OR (to_jsonb(OLD)->>'status'='refunded' AND to_jsonb(NEW)->>'status'<>'refunded') OR (to_jsonb(OLD)->>'status'='captured' AND to_jsonb(NEW)->>'status'='reserved')))
    OR (TG_TABLE_NAME='CreditAccount' AND ((to_jsonb(NEW)->'source') IS DISTINCT FROM (to_jsonb(OLD)->'source') OR (to_jsonb(NEW)->'sourceHash') IS DISTINCT FROM (to_jsonb(OLD)->'sourceHash') OR (to_jsonb(NEW)->'importedCycle') IS DISTINCT FROM (to_jsonb(OLD)->'importedCycle') OR (to_jsonb(NEW)->'legacyMonthlyGrant') IS DISTINCT FROM (to_jsonb(OLD)->'legacyMonthlyGrant') OR ((to_jsonb(OLD)->>'activationSequence') IS NOT NULL AND (to_jsonb(NEW)->'activationSequence') IS DISTINCT FROM (to_jsonb(OLD)->'activationSequence')) OR ((to_jsonb(OLD)->>'activatedAt') IS NOT NULL AND (to_jsonb(NEW)->'activatedAt') IS DISTINCT FROM (to_jsonb(OLD)->'activatedAt')))) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CREDITS_TERMS_IMMUTABLE: 原來源、期限與預扣內容不得改寫 / Original sources, expiry and hold terms are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER credit_lot_terms BEFORE UPDATE ON "CreditLot" FOR EACH ROW EXECUTE FUNCTION nova_credit_terms_immutable();
CREATE TRIGGER credit_hold_terms BEFORE UPDATE ON "CreditHold" FOR EACH ROW EXECUTE FUNCTION nova_credit_terms_immutable();
CREATE TRIGGER credit_account_terms BEFORE UPDATE ON "CreditAccount" FOR EACH ROW EXECUTE FUNCTION nova_credit_terms_immutable();
CREATE TRIGGER credit_allocation_immutable BEFORE UPDATE ON "CreditAllocation" FOR EACH ROW EXECUTE FUNCTION nova_credit_immutable();
