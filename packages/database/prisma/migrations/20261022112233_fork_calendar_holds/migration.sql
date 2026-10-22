-- Fork: CalDAV credentials, calendar entries written for polls and calendar preferences
-- CreateEnum
CREATE TYPE "calendar_hold_kind" AS ENUM ('tentative', 'confirmed');

-- AlterEnum
ALTER TYPE "CredentialType" ADD VALUE 'CALDAV';

-- AlterTable
ALTER TABLE "calendar_connections" ADD COLUMN     "error_at" TIMESTAMP(3),
ADD COLUMN     "error_message" TEXT;

-- CreateTable
CREATE TABLE "calendar_holds" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "option_id" TEXT NOT NULL,
    "kind" "calendar_hold_kind" NOT NULL,
    "provider_calendar_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "etag" TEXT,
    "uid" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_preferences" (
    "user_id" TEXT NOT NULL,
    "holds_enabled" BOOLEAN NOT NULL DEFAULT true,
    "hold_if_need_be" BOOLEAN NOT NULL DEFAULT true,
    "auto_prefill" BOOLEAN NOT NULL DEFAULT true,
    "busy_vote" TEXT NOT NULL DEFAULT 'no',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "calendar_holds_poll_id_idx" ON "calendar_holds"("poll_id");

-- CreateIndex
CREATE INDEX "calendar_holds_provider_calendar_id_idx" ON "calendar_holds"("provider_calendar_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_holds_user_id_poll_id_option_id_key" ON "calendar_holds"("user_id", "poll_id", "option_id");

-- AddForeignKey
ALTER TABLE "calendar_holds" ADD CONSTRAINT "calendar_holds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_holds" ADD CONSTRAINT "calendar_holds_provider_calendar_id_fkey" FOREIGN KEY ("provider_calendar_id") REFERENCES "provider_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_preferences" ADD CONSTRAINT "calendar_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
