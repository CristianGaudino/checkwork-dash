// A popover that is a panel under its button from 640px and a sheet from the foot of the screen over a dimmed page on a phone: the table
// filters and the bell. `sheetPanel` is its look (add a width from sm); `placeSheet` puts it under the button on a desktop, kept on screen,
// and leaves a phone's to the CSS. Run it from the button's click, after the browser has opened the popover.
export const sheetPanel =
  "fixed m-0 max-h-[85dvh] w-full flex-col overflow-hidden border border-hairline bg-card text-text shadow-lift max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:rounded-t-card sm:inset-auto sm:rounded-card [&:popover-open]:flex" +
  // Dialog's motion, both ways: a phone's sheet slides up over a scrim that fades in; from 640px the panel fades and drops in a little (its
  // first frame, before placeSheet moves it under the button, is hidden). A fade only under reduced motion.
  " transition-[opacity,translate,overlay,display] transition-discrete duration-300 ease-sheet max-sm:translate-y-full max-sm:open:translate-y-0 max-sm:starting:open:translate-y-full" +
  " sm:opacity-0 sm:-translate-y-1 sm:open:opacity-100 sm:open:translate-y-0 sm:starting:open:opacity-0 sm:starting:open:-translate-y-1 sm:duration-200 sm:ease-out" +
  " backdrop:bg-transparent backdrop:transition-[background-color,overlay,display] backdrop:transition-discrete backdrop:duration-300 max-sm:open:backdrop:bg-scrim max-sm:starting:open:backdrop:bg-transparent" +
  " motion-reduce:translate-y-0! motion-reduce:opacity-0 motion-reduce:open:opacity-100 motion-reduce:starting:open:opacity-0 motion-reduce:duration-150";

export function placeSheet(panel: HTMLElement | null, button: HTMLElement | null, opened?: () => void) {
  requestAnimationFrame(() => {
    const b = button?.getBoundingClientRect();
    if (!panel || !b || !panel.matches(":popover-open")) return;
    const desk = window.matchMedia("(min-width: 640px)").matches;
    // Under the button, but moved up when that would run off the foot of the screen (a toolbar low on a page), so the whole panel shows.
    panel.style.top = desk ? `${Math.max(8, Math.min(b.bottom + 6, window.innerHeight - panel.offsetHeight - 8))}px` : "";
    panel.style.left = desk ? `${Math.max(8, Math.min(b.left, window.innerWidth - panel.offsetWidth - 8))}px` : "";
    opened?.();
  });
}
