import { adminButton, adminButtonQuiet } from "@/components/admin/kit";
import type { ReplyVia } from "@/lib/admin/leads";
import { MailIcon, PhoneIcon, WhatsAppIcon } from "@/components/stock/icons";
import { NEW_TAB } from "@/components/ui";
import { telHref, waHref } from "@/lib/phone";

// Call, Email and WhatsApp, one tap each: only the ways this person can be reached (a website lead may give a phone or an email, not both).
// Secondary (tonal) buttons with their icons, in one row that wraps only on the narrowest phone, under the page's one filled action. The same on a lead and a test drive, so a salesperson finds them in the same place.
// `main`: on a lead, the way to answer them (replyVia) is the page's filled action.
export function ContactButtons({ phone, email, main }: { phone?: string; email?: string; main?: ReplyVia }) {
  const look = (via: ReplyVia) => (via === main ? adminButton : adminButtonQuiet);
  const tel = phone ? telHref(phone) : undefined;
  const wa = phone ? waHref(phone) : undefined;
  return (
    <div className="flex flex-wrap gap-2 *:grow *:px-3">
      {tel && (
        <a href={tel} className={look("call")}>
          <PhoneIcon className="size-4 shrink-0" />
          Call
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className={look("email")}>
          <MailIcon className="size-4 shrink-0" />
          Email
        </a>
      )}
      {wa && (
        <a href={wa} {...NEW_TAB} className={look("whatsapp")}>
          <WhatsAppIcon className="size-4 shrink-0 text-whatsapp" />
          WhatsApp<span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}
