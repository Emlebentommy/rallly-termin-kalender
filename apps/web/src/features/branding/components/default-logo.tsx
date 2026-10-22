import { cn } from "@rallly/ui";
import LogoMark from "@/features/branding/assets/logo.svg";
import { DEFAULT_APP_NAME, LOGO_VIEWBOX } from "@/features/branding/constants";

/**
 * The default wordmark: the calendar mark next to the app name, inlined so
 * the most viewed pages don't each fetch it. The mark takes the primary color
 * and the theme accent, and the name follows the instance's app name, so the
 * default logo stays right when either is changed in the design settings.
 */
export function DefaultWordmark({
  className,
  height,
  appName = DEFAULT_APP_NAME,
}: {
  className?: string;
  /** Height in px; the name is sized against it. */
  height: number;
  appName?: string;
}) {
  return (
    <span
      role="img"
      aria-label={appName}
      className={cn(
        "inline-flex items-center text-primary dark:text-white",
        className,
      )}
      style={{ height, gap: Math.round(height * 0.28) }}
    >
      <LogoMark aria-hidden="true" className="h-full w-auto shrink-0" />
      <span
        aria-hidden="true"
        className="whitespace-nowrap text-foreground leading-none tracking-tight [font-family:var(--font-heading,inherit)] [font-weight:var(--font-heading-weight,700)]"
        style={{ fontSize: Math.round(height * 0.72) }}
      >
        {appName}
      </span>
    </span>
  );
}

/**
 * Renders the default logo in the same viewbox as `Logo` with `size="fit"`.
 * Static assets only, so it stays safe to render from client error boundaries
 * where instance branding config is unavailable.
 */
export function DefaultLogo({
  className,
  appName,
}: {
  className?: string;
  appName?: string;
}) {
  return (
    <div
      className={cn("flex items-center justify-center", className)}
      style={{ width: LOGO_VIEWBOX.width, height: LOGO_VIEWBOX.height }}
    >
      <DefaultWordmark height={40} appName={appName} />
    </div>
  );
}
