import assert from "node:assert/strict";
import test from "node:test";
import { requireDatabaseUrl } from "../src/lib/database-config";

test("Missing database configuration fails immediately with the deployment target", () => {
  for (const value of [undefined, "", "   "]) assert.throws(() => requireDatabaseUrl(value, "preview"), /DATABASE_URL.*Preview/);
  assert.throws(() => requireDatabaseUrl(undefined, "production"), /Production/);
});
test("Database configuration requires a PostgreSQL host and database", () => {
  for (const value of ["not-a-url", "https://example.invalid/db", "postgresql://example.invalid/"]) assert.throws(() => requireDatabaseUrl(value, "preview"), /DATABASE_URL/);
});
test("Configuration errors never echo database credentials", () => {
  for (const value of ["secret-password-not-a-url", "https://user:secret-password@example.invalid/db"]) {
    assert.throws(() => requireDatabaseUrl(value, "preview"), error => error instanceof Error && !error.message.includes("secret-password") && !error.message.includes(value));
  }
});
test("Valid Neon and isolated QA URLs retain their options", () => {
  for (const value of ["postgresql://user:password@example.invalid/db?sslmode=require", "postgres://eric@127.0.0.1:55439/roll_rewards_qa"]) assert.equal(requireDatabaseUrl(`  ${value}  `), value);
});
