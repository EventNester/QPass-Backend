-- Enhanced check-in: expand scan result enum and support soft-delete of check-ins.

ALTER TYPE "CheckInResult" ADD VALUE 'EXPIRED';
ALTER TYPE "CheckInResult" ADD VALUE 'WRONG_EVENT';
ALTER TYPE "CheckInResult" ADD VALUE 'REVOKED';
ALTER TYPE "CheckInResult" ADD VALUE 'NOT_AUTHORIZED';

ALTER TABLE "check_ins" ADD COLUMN "deleted_at" TIMESTAMP(3);
