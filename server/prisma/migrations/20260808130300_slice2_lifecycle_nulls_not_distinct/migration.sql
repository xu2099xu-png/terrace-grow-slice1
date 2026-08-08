-- Fix: PostgreSQL default unique index treats NULLs as distinct.
-- Enforce true uniqueness for crop-level templates where varietyId=null.
DROP INDEX IF EXISTS "LifecycleTemplate_cropId_varietyId_startMethod_version_key";
CREATE UNIQUE INDEX "LifecycleTemplate_cropId_varietyId_startMethod_version_key"
  ON "LifecycleTemplate"("cropId", "varietyId", "startMethod", "version") NULLS NOT DISTINCT;
