import { cn } from "@rallly/ui";
import {
  DefaultLogo,
  DefaultWordmark,
} from "@/features/branding/components/default-logo";
import {
  DEFAULT_LOGO_URL,
  DEFAULT_LOGO_URL_DARK,
  LOGO_VIEWBOX,
} from "@/features/branding/constants";
import { getInstanceBrandingConfig } from "@/features/branding/data";

const sizes = {
  sm: {
    height: 22,
  },
  md: {
    height: 32,
  },
};

export const Logo = async ({
  className,
  size = "md",
}: {
  className?: string;
  size?: keyof typeof sizes | "fit";
}) => {
  const { logo, appName } = await getInstanceBrandingConfig();

  // The default logo is inlined; only a custom one is fetched as an image
  if (logo.light === DEFAULT_LOGO_URL && logo.dark === DEFAULT_LOGO_URL_DARK) {
    if (size === "fit") {
      return <DefaultLogo className={className} appName={appName} />;
    }
    return (
      <div
        className={cn("inline-block", className)}
        style={{ height: sizes[size].height }}
      >
        <DefaultWordmark height={sizes[size].height} appName={appName} />
      </div>
    );
  }

  if (size === "fit") {
    return (
      <div
        className={cn("flex items-center justify-center", className)}
        style={{ width: LOGO_VIEWBOX.width, height: LOGO_VIEWBOX.height }}
      >
        {/* biome-ignore lint/performance/noImgElement: we don't need Image component here */}
        <img
          src={logo.light}
          alt={appName}
          className="block max-h-full max-w-full object-contain dark:hidden"
        />
        {/* biome-ignore lint/performance/noImgElement: we don't need Image component here */}
        <img
          src={logo.dark}
          alt={appName}
          className="hidden max-h-full max-w-full object-contain dark:block"
        />
      </div>
    );
  }

  return (
    <div
      className={cn("inline-block", className)}
      style={{ height: sizes[size].height }}
    >
      {/* biome-ignore lint/performance/noImgElement: we don't need Image component here */}
      <img
        src={logo.light}
        alt={appName}
        className="block h-full w-auto object-contain dark:hidden"
        style={{
          height: sizes[size].height,
        }}
      />
      {/* biome-ignore lint/performance/noImgElement: we don't need Image component here */}
      <img
        src={logo.dark}
        alt={appName}
        className="hidden h-full w-auto object-contain dark:block"
        style={{
          height: sizes[size].height,
        }}
      />
    </div>
  );
};
