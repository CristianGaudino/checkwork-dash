"use client";

import { useLinkStatus } from "next/link";

// Inside a Link: a hidden mark while its navigation is on its way, so the link can take the chosen look at the tap with CSS alone
// (has-data-pending:, and group-has-data-pending: on the others). Next clears it when the navigation lands, is replaced or is cancelled.
export function LinkPending() {
  return useLinkStatus().pending ? <span hidden data-pending /> : null;
}
