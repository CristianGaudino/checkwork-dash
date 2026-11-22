import { fmtEur } from "@/lib/stock/format";
import { fmtDay } from "@/lib/admin/format";
import { EMPLOYMENT } from "./constants";
import { DETAIL_LABELS } from "./schema";
import { ANSWER_KEYS, readable } from "./contact-topics";

// A lead's message is the buyer's own words. The form's other answers are kept beside it as a short list, label to value as read (#59).

// The form stores keys and raw numbers; the dealer reads words and formatted figures. A value already in words is left as it is.
export function show(key: string, value: unknown): string {
  const v = String(value);
  const num = /^\d+(\.\d+)?$/.test(v);
  if (key === "employment") return EMPLOYMENT[v as keyof typeof EMPLOYMENT] ?? v;
  if (key === "intent") return v === "sell" ? "Sell the car" : v === "trade" ? "Trade it in" : v;
  if (key === "mileage") return num ? `${Number(v).toLocaleString("en-IE")} km` : v;
  if ((key === "budgetMax" || key === "deposit") && num) return fmtEur(Number(v));
  if (key === "driveDate" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `${fmtDay(v, "weekday")} ${fmtDay(v, "day")} ${fmtDay(v, "month")}`; // Sat 30 Nov
  return readable(key, v);
}

export type Facts = Record<string, string>; // label to value, in the form's order
const DRIVE = "Test drive";

// The answers a lead keeps besides its words: only those shown nowhere else. The topic and tap answers are its tags (stored as `answers`
// when there is a topic), the channel is where it came from, the reg has its own panel, sell or trade in is its kind, and a factory order's car is its message.
export function detailsOf(type: string, d: Record<string, unknown>): Facts {
  const skip = new Set<string>(["topic", "channel", "reg", "whatsappOptIn", "alertKind", "intent", "driveDate", "driveTime", ...(typeof d.topic === "string" ? ANSWER_KEYS : []), ...(type === "order" ? ["make", "model", "spec", "regPeriod"] : [])]);
  return {
    ...(d.driveDate !== undefined && d.driveTime !== undefined && { [DRIVE]: `${show("driveDate", d.driveDate)}, ${String(d.driveTime)}` }),
    ...Object.fromEntries(Object.entries(DETAIL_LABELS).filter(([k]) => d[k] !== undefined && !skip.has(k)).map(([k, label]) => [label, show(k, d[k])])),
  };
}

const KEY_OF: Record<string, string> = Object.fromEntries(Object.entries(DETAIL_LABELS).map(([k, label]) => [label, k]));
const LABELS = Object.values(DETAIL_LABELS).sort((a, b) => b.length - a.length).map((l) => l.replace(/[()]/g, "\\$&")).join("|");
const PAIR = new RegExp(`^(${LABELS}): (.+)$`, "s");
const NEXT = new RegExp(`\\. (?=(?:${LABELS}): )`);
const OLD_DRIVE = /^Test drive on (\d{4}-\d{2}-\d{2}) at (\d{2}:\d{2})\.(?: ([\s\S]*))?$/;

// A lead stored before #59 has its answers glued to the front of its message ("About: Buying a car. Hoping to buy: This month.\n\nHi"),
// and a test drive starts "Test drive on 2026-11-30 at 10:00.": read back into the answers (by key) and the words. Anything else is words.
export function splitOldMessage(message: string): { text: string; given: [key: string, value: string][] } {
  const drive = OLD_DRIVE.exec(message);
  if (drive) return { text: drive[3] ?? "", given: [["drive", `${show("driveDate", drive[1])}, ${drive[2]}`]] };
  const cut = message.indexOf("\n\n");
  const [head, rest] = cut < 0 ? [message, ""] : [message.slice(0, cut), message.slice(cut + 2)];
  const pairs = head.split(NEXT).map((p) => PAIR.exec(p));
  if (!pairs.every(Boolean)) return { text: message, given: [] };
  return { text: rest, given: pairs.map((m) => [KEY_OF[m![1]!]!, show(KEY_OF[m![1]!]!, m![2]!.replace(/\.$/, ""))]) };
}

type LeadLike = { message: string; details?: Facts; topic?: string; answers?: Record<string, string>; channel?: string; reg?: string; whatsappOptIn?: boolean };

// What a lead shows: their words, and the list of answers not already shown as its tags, source or reg. How they want to be reached and
// when are answers, but no tag says them, so the list does.
export function readLead(l: LeadLike): { text: string; facts: Facts } {
  const old = splitOldMessage(l.message);
  const shown = (k: string) => (k === "topic" ? l.topic : k === "channel" ? l.channel : k === "reg" ? l.reg : k === "whatsappOptIn" ? l.whatsappOptIn : k === "alertKind" || k === "intent" || l.answers?.[k]);
  const facts: Facts = { ...Object.fromEntries(old.given.filter(([k]) => !shown(k)).map(([k, v]) => [k === "drive" ? DRIVE : DETAIL_LABELS[k]!, v])), ...l.details };
  for (const k of ["contactVia", "contactWhen"] as const) if (l.answers?.[k]) facts[DETAIL_LABELS[k]!] = readable(k, l.answers[k]);
  return { text: old.text.trim(), facts };
}
