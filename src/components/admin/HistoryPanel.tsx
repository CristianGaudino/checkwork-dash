import { ActButton } from "@/components/admin/ActButton";
import { Badge, Panel, rowButton } from "@/components/admin/kit";
import { fmtDate } from "@/lib/admin/format";
import { parseIrishReg } from "@/lib/reg";
import { CLEAN, historyFacts, historyWarnings, type VehicleHistory } from "@/lib/history-rules";

// A car's history check (#170) in short: what needs a second look in plain words, or that it is clean, its facts, and the day it was checked,
// with Check history (Check again once done). A check kept for another plate (the registration changed since) is not shown.
export function HistoryPanel({ title = "History check", reg, history, act }: { title?: string; reg: string; history?: VehicleHistory; act: () => Promise<unknown> }) {
  const h = history && history.reg === parseIrishReg(reg)?.reg ? history : undefined;
  const warnings = h ? historyWarnings(h) : [];
  return (
    <Panel
      title={title}
      action={
        <ActButton act={act} done="History checked" className={rowButton}>
          {h ? "Check again" : "Check history"}
        </ActButton>
      }
    >
      {!h ? (
        <p className="text-body text-text-2">{reg}, not checked yet.</p>
      ) : (
        <>
          {warnings.length ? (
            <ul aria-label="Needs a second look" className="flex flex-wrap gap-2">
              {warnings.map((w) => (
                <li key={w}>
                  <Badge tone="warn">{w}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body">{CLEAN}</p>
          )}
          <p className="text-meta text-text-2">
            {[h.reg, ...historyFacts(h)].join(" · ")}. Checked {fmtDate(h.checkedOn)}.
          </p>
        </>
      )}
    </Panel>
  );
}
