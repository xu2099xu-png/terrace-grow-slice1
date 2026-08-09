-- Slice 5 AI explanation infrastructure only.
-- These tables cache validated public AI explanation responses and track
-- per-user provider call caps. They are not agricultural content.

CREATE TABLE "AiExplanationCache" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cacheKeyHash" TEXT NOT NULL,
  "responseJson" JSONB NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiExplanationCache_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiProviderUsageDay" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "callCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiProviderUsageDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiExplanationCache_cacheKeyHash_key" ON "AiExplanationCache"("cacheKeyHash");
CREATE INDEX "AiExplanationCache_userId_idx" ON "AiExplanationCache"("userId");
CREATE INDEX "AiExplanationCache_expiresAt_idx" ON "AiExplanationCache"("expiresAt");
CREATE UNIQUE INDEX "AiProviderUsageDay_userId_day_provider_key" ON "AiProviderUsageDay"("userId", "day", "provider");

ALTER TABLE "AiExplanationCache"
  ADD CONSTRAINT "AiExplanationCache_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiProviderUsageDay"
  ADD CONSTRAINT "AiProviderUsageDay_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
