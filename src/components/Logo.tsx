import Image from "next/image";
import type { DealerProfile } from "@/lib/tenancy/profile";

// The dealer's logo (their profile) in the wordmark colour that reads on the current theme: dark words on light, white words on dark. The
// one that does not match the theme is display:none, so it is neither seen nor read out. A dealer with no logo yet shows their name.
export function Logo({ name, logo, className = "h-8 w-auto", eager = false }: { name: string; logo?: DealerProfile["logo"]; className?: string; eager?: boolean }) {
  if (!logo) return <span className="truncate font-display text-heading font-semibold">{name}</span>;
  const common = { width: 345, height: 60, loading: eager ? ("eager" as const) : undefined, unoptimized: true };
  return (
    <>
      <Image src={logo.onLight} alt={name} {...common} className={`${className} dark:hidden`} />
      <Image src={logo.onDark} alt={name} {...common} className={`${className} hidden dark:block`} />
    </>
  );
}
