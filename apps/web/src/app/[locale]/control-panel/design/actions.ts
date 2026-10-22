"use server";

import {
  designSettingsSchema,
  MAX_DESIGN_ASSET_SIZE,
  removeDesignAssetSchema,
  uploadDesignAssetSchema,
} from "@/features/branding/schema";
import {
  DESIGN_ASSET_TYPES,
  detectDesignAssetMimeType,
} from "@/features/branding/utils";
import {
  removeInstanceAsset,
  saveInstanceAsset,
  updateInstanceSettings,
} from "@/features/instance-settings/mutations";
import { adminActionClient } from "@/lib/safe-action/server";

export const saveDesignSettingsAction = adminActionClient
  .metadata({
    actionName: "save_design_settings",
  })
  .inputSchema(designSettingsSchema)
  .action(async ({ parsedInput }) => {
    await updateInstanceSettings({
      ...parsedInput,
      customCss: parsedInput.customCss?.trim() || null,
    });
  });

export const uploadDesignAssetAction = adminActionClient
  .metadata({
    actionName: "upload_design_asset",
  })
  .inputSchema(uploadDesignAssetSchema)
  .action(async ({ parsedInput }) => {
    const data = new Uint8Array(Buffer.from(parsedInput.dataBase64, "base64"));

    if (data.byteLength === 0 || data.byteLength > MAX_DESIGN_ASSET_SIZE) {
      return { ok: false as const, error: "tooLarge" as const };
    }

    const mimeType = detectDesignAssetMimeType(data);

    if (!mimeType || !DESIGN_ASSET_TYPES[parsedInput.key].includes(mimeType)) {
      return { ok: false as const, error: "unsupportedType" as const };
    }

    await saveInstanceAsset({
      key: parsedInput.key,
      mimeType,
      fileName: parsedInput.fileName,
      data,
    });

    return { ok: true as const };
  });

export const removeDesignAssetAction = adminActionClient
  .metadata({
    actionName: "remove_design_asset",
  })
  .inputSchema(removeDesignAssetSchema)
  .action(async ({ parsedInput }) => {
    await removeInstanceAsset(parsedInput.key);
  });
