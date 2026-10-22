export function RandomGradientBar() {
  // Primary into the theme accent (Tanne into Sonne in the default theme)
  return (
    <div className="-mx-px -mt-px h-2 bg-linear-to-r/oklch from-35% from-primary to-(--brand-accent,var(--color-primary)) sm:rounded-t-2xl" />
  );
}
