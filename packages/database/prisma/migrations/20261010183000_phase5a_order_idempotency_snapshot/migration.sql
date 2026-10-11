ALTER TABLE "Order"
  ADD COLUMN "addressSnapshot" JSONB,
  ADD COLUMN "idempotencyRequestHash" TEXT;

DROP INDEX "Order_idempotencyKey_key";

CREATE UNIQUE INDEX "Order_userId_idempotencyKey_key"
  ON "Order"("userId", "idempotencyKey");