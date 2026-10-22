import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { designAssetKeys } from "@/features/branding/constants";
import { getInstanceAsset } from "@/features/instance-settings/data";

/**
 * Serves the logos and fonts uploaded in the design settings. They are public
 * by nature (every page and email shows them), so the route has no auth.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ key: string }> },
) {
  const { key } = await context.params;

  if (!(designAssetKeys as readonly string[]).includes(key)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const asset = await getInstanceAsset(key);

  if (!asset) {
    return new NextResponse("Not found", { status: 404 });
  }

  // A versioned URL names one upload forever; an unversioned one must
  // follow a replaced file.
  const versioned = req.nextUrl.searchParams.has("v");

  return new NextResponse(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.mimeType,
      "Cache-Control": versioned
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
      "Last-Modified": asset.updatedAt.toUTCString(),
      // Same policy as /api/storage: an uploaded SVG opened directly cannot
      // run scripts, and <img>/@font-face loads are unaffected.
      "Content-Security-Policy": "sandbox; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      // Fonts load cross-origin in email previews and embedded widgets
      "Access-Control-Allow-Origin": "*",
    },
  });
}
