// A number as typed ("087 123 4567", "+353 87…", "00353 87…") in international digits, for call and WhatsApp links. An Irish
// number typed with its leading 0 gets 353, and a "(0)" after the country code ("+353 (0)87…") is dropped. Null when it is too short to dial.
export function intlDigits(phone: string): string | null {
  const d = phone.replace(/(\d)\s*\(\s*0\s*\)/g, "$1").replace(/\D/g, "");
  const intl = phone.trim().startsWith("+") ? d : d.startsWith("00") ? d.slice(2) : d.startsWith("0") ? `353${d.slice(1)}` : d;
  return intl.length >= 8 ? intl : null;
}
export const telHref = (phone: string) => {
  const d = intlDigits(phone);
  return d ? `tel:+${d}` : null;
};
// WhatsApp only for an Irish mobile (083 to 089) or a number from abroad: never an Irish landline (owner, #190).
const onWhatsApp = (digits: string) => !digits.startsWith("353") || /^3538[3-9]/.test(digits);
// `text`: a message filled in, which they can still edit before sending. Null when the number cannot be on WhatsApp.
export const waHref = (phone: string, text?: string) => {
  const d = intlDigits(phone);
  return d && onWhatsApp(d) ? `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}` : null;
};
