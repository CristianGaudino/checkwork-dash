import { Panel, adminButton } from "@/components/admin/kit";
import { ExternalIcon } from "@/components/stock/icons";
import { NEW_TAB } from "@/components/ui";
import { listing } from "@/lib/stock-source";

// Shown where a car would be added, when the stock comes from DoneDeal: cars are added there.
export async function SyncedNotice() {
  const { site, url } = await listing();
  return (
    <Panel title={`This stock comes from ${site}`} text="Add, edit and sell cars there; your website updates within 15 minutes">
      <a href={url} {...NEW_TAB} className={`${adminButton} self-start`}>
        Open {site}
        <ExternalIcon className="shrink-0 size-4" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </Panel>
  );
}
