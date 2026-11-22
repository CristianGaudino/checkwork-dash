import { Logo } from "@/components/Logo";

// The Checkwork logo at the top of the sign-in screens, the one the dashboard's frame uses (public/brand/).
export const Brand = () => <Logo name="Checkwork" logo={{ onLight: "/brand/logo-on-light.svg", onDark: "/brand/logo.svg" }} className="h-8 w-auto" eager />;
