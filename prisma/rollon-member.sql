-- 純新增欄位，不更新會員、訂閱或付款紀錄；重跑時停止以便核對既有結構。
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "User" ADD COLUMN "rollonMember" BOOLEAN NOT NULL DEFAULT false;
COMMIT;
