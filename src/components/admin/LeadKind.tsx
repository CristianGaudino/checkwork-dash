import { LEAD_TYPE_LABELS, type LeadType } from "@/lib/admin/collections";
import { TOPICS, topicBits, type Answers } from "@/lib/leads/contact-topics";
import { CalendarIcon, CarIcon, InboxIcon, PercentIcon, SearchIcon, ShieldCheckIcon, SwapIcon, TruckIcon, WrenchIcon } from "@/components/stock/icons";

// What kind of request a lead is, in a word and an icon: the first thing read after the name. A general message from the guided contact
// form says its topic ("Buying", "Service") instead of "Message", which says less.
const ICONS = { enquiry: CarIcon, "test-drive": CalendarIcon, finance: PercentIcon, "trade-in": SwapIcon, sell: SwapIcon, "find-a-car": SearchIcon, order: TruckIcon, warranty: ShieldCheckIcon, service: WrenchIcon, general: InboxIcon } as const;
const TOPIC_TYPE: Record<string, LeadType> = { buying: "enquiry", selling: "sell", finance: "finance", service: "service", bought: "warranty" };

export function leadKind(type: LeadType, topic?: string): { label: string; icon: LeadType } {
  if (type !== "general" || !topic) return { label: LEAD_TYPE_LABELS[type], icon: type };
  return { label: TOPICS.find((t) => t.id === topic)?.subject ?? LEAD_TYPE_LABELS.general, icon: TOPIC_TYPE[topic] ?? "general" };
}

// The chips under the kind: the topic when the kind does not already say it, then the answers. Never a contact detail (topicBits).
export function leadChips(type: LeadType, topic: string | undefined, answers: Answers = {}): string[] {
  const subject = TOPICS.find((t) => t.id === topic)?.subject;
  // Each chip stands alone, so each starts with a capital ("This week"), where topicBits writes them for a running line.
  return [...(subject && subject !== leadKind(type, topic).label ? [subject] : []), ...topicBits(answers)].map((t) => t[0]!.toUpperCase() + t.slice(1));
}

export function LeadKind({ type, topic }: { type: LeadType; topic?: string }) {
  const { label, icon } = leadKind(type, topic);
  const Icon = ICONS[icon];
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-text">
      <Icon className="size-4 shrink-0 text-accent-text" />
      {label}
    </span>
  );
}

// The guided form's answers ("this week", "trade-in") as small chips, so they read as separate facts. `urgent` tints them amber.
export function LeadTags({ tags, urgent = false }: { tags: string[]; urgent?: boolean }) {
  if (tags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2 text-meta ${urgent ? "bg-warn-soft font-medium text-warn" : "bg-hairline text-text-2"}`}>
          {t}
        </span>
      ))}
    </span>
  );
}
