-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "subject" TEXT;
ALTER TABLE "notifications" ADD COLUMN "context" JSONB;
