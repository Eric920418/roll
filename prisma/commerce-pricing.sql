-- Only the price constraint changes; existing reservations and ledger entries stay untouched.
ALTER TABLE "TokenReservation" DROP CONSTRAINT IF EXISTS "TokenReservation_price";
ALTER TABLE "TokenReservation" ADD CONSTRAINT "TokenReservation_price" CHECK ("kind" IN ('invite', 'search') AND "amount" >= 1 AND "amount" <= 1000000);
