-- Fork: design settings without license gate, and DB-backed design assets
-- AlterTable
ALTER TABLE "instance_settings" ADD COLUMN     "accent_color" TEXT,
ADD COLUMN     "background_color" TEXT,
ADD COLUMN     "background_color_dark" TEXT,
ADD COLUMN     "custom_css" TEXT,
ADD COLUMN     "font_body" TEXT,
ADD COLUMN     "font_heading" TEXT,
ADD COLUMN     "neutral_tone" TEXT,
ADD COLUMN     "radius" TEXT,
ADD COLUMN     "theme_preset" TEXT;

-- CreateTable
CREATE TABLE "instance_assets" (
    "key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_name" TEXT,
    "data" BYTEA NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instance_assets_pkey" PRIMARY KEY ("key")
);
