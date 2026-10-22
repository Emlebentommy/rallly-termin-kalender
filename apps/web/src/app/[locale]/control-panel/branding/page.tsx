import { redirect } from "next/navigation";

// The license-gated branding page became the design page in this fork
export default function BrandingPage() {
  redirect("/control-panel/design");
}
