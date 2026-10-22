import { CalendarDaysIcon } from "lucide-react";
import GoogleCalendarIcon from "@/features/calendars/assets/google-calendar.svg";
import OutlookIcon from "@/features/calendars/assets/outlook.svg";

export function CalendarProviderIcon({
  provider,
  size,
}: {
  provider: string;
  size: number;
}) {
  switch (provider) {
    case "google":
      return <GoogleCalendarIcon width={size} height={size} />;
    case "microsoft":
      return <OutlookIcon width={size} height={size} />;
    case "caldav":
      return (
        <span
          className="inline-flex items-center justify-center rounded-lg bg-primary/10 text-primary"
          style={{ width: size, height: size }}
        >
          <CalendarDaysIcon style={{ width: size * 0.6, height: size * 0.6 }} />
        </span>
      );
    default:
      return null;
  }
}
