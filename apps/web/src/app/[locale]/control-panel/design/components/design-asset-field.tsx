"use client";

import { mutationOptions } from "@next-safe-action/adapter-tanstack-query";
import { cn } from "@rallly/ui";
import { Button } from "@rallly/ui/button";
import { toast } from "@rallly/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { TypeIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import React from "react";
import type { DesignAssetKey } from "@/features/branding/constants";
import { MAX_DESIGN_ASSET_SIZE } from "@/features/branding/schema";
import { Trans, useTranslation } from "@/i18n/client";
import { removeDesignAssetAction, uploadDesignAssetAction } from "../actions";

const ACCEPT: Record<DesignAssetKey, string> = {
  logo: "image/png,image/jpeg,image/webp,image/svg+xml",
  logoDark: "image/png,image/jpeg,image/webp,image/svg+xml",
  logoIcon: "image/png,image/jpeg",
  fontBody: ".woff2,.woff,.ttf,.otf",
  fontHeading: ".woff2,.woff,.ttf,.otf",
};

const isFont = (key: DesignAssetKey) =>
  key === "fontBody" || key === "fontHeading";

async function readAsBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function DesignAssetField({
  assetKey,
  current,
  previewUrl,
  dark = false,
}: {
  assetKey: DesignAssetKey;
  /** The uploaded file, if any. */
  current: { url: string; fileName: string | null } | null;
  /** What is shown today, which may be the default when nothing is uploaded. */
  previewUrl?: string;
  dark?: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const font = isFont(assetKey);
  const fontFamily = `design-asset-${assetKey}`;

  const upload = useMutation(
    mutationOptions(uploadDesignAssetAction, {
      onSuccess: (result) => {
        if (!result?.ok) {
          toast.error(
            result?.error === "tooLarge"
              ? t("designAssetTooLarge", {
                  defaultValue: "The file is larger than 512 KB.",
                })
              : t("designAssetUnsupported", {
                  defaultValue: "This file type is not supported here.",
                }),
          );
          return;
        }
        toast.success(t("saved", { defaultValue: "Saved" }));
        router.refresh();
      },
    }),
  );
  const remove = useMutation(
    mutationOptions(removeDesignAssetAction, {
      onSuccess: () => router.refresh(),
    }),
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_DESIGN_ASSET_SIZE) {
      toast.error(
        t("designAssetTooLarge", {
          defaultValue: "The file is larger than 512 KB.",
        }),
      );
      return;
    }
    upload.mutate({
      key: assetKey,
      fileName: file.name.slice(0, 200),
      dataBase64: await readAsBase64(file),
    });
  };

  return (
    <div className="w-full space-y-3">
      {font ? (
        <div className="flex min-h-20 items-center gap-4 rounded-lg border bg-card px-4 py-3">
          <TypeIcon className="size-5 shrink-0 text-muted-foreground" />
          {current ? (
            <>
              <style>{`@font-face{font-family:"${fontFamily}";src:url("${current.url}");}`}</style>
              <div className="min-w-0">
                <p className="truncate text-2xl" style={{ fontFamily }}>
                  Termine finden – Äpfel & Öl
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {current.fileName}
                </p>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              <Trans i18nKey="designAssetNoFont" defaults="No font uploaded" />
            </p>
          )}
        </div>
      ) : (
        <div
          className={cn(
            "flex h-28 items-center justify-center rounded-lg border",
            dark ? "bg-gray-900" : "bg-white",
          )}
        >
          {previewUrl ? (
            // biome-ignore lint/performance/noImgElement: preview of an arbitrary uploaded file
            <img
              src={previewUrl}
              alt=""
              className={cn(
                "max-w-[70%] object-contain",
                assetKey === "logoIcon" ? "size-16" : "max-h-16",
              )}
            />
          ) : null}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT[assetKey]}
          className="hidden"
          onChange={(event) => {
            void onFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <Button
          size="sm"
          loading={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          <UploadIcon data-icon="inline-start" />
          {current ? (
            <Trans i18nKey="designAssetReplace" defaults="Replace" />
          ) : (
            <Trans i18nKey="designAssetUpload" defaults="Upload" />
          )}
        </Button>
        {current ? (
          <Button
            size="sm"
            variant="ghost"
            loading={remove.isPending}
            onClick={() => remove.mutate({ key: assetKey })}
          >
            <Trans i18nKey="designAssetRemove" defaults="Remove" />
          </Button>
        ) : null}
        <span className="text-muted-foreground text-xs">
          {font ? (
            <Trans
              i18nKey="designAssetFontHint"
              defaults="WOFF2, WOFF, TTF or OTF, up to 512 KB"
            />
          ) : assetKey === "logoIcon" ? (
            <Trans
              i18nKey="designAssetIconHint"
              defaults="PNG or JPG, square, up to 512 KB. Also used in emails."
            />
          ) : (
            <Trans
              i18nKey="designAssetLogoHint"
              defaults="SVG, PNG, JPG or WebP, up to 512 KB"
            />
          )}
        </span>
      </div>
    </div>
  );
}
