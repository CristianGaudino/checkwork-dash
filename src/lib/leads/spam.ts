// The spam check on a lead as it arrives (#56). Rules only, no outside service, and nothing is logged. Careful by design, so a real
// customer is never marked spam: a name in any language, a short or empty message, no phone and a link to a car are all normal. Clear
// spam is "spam"; a hint of it is "maybe" (Possible spam: it stays in To answer now for a person to decide); anything else passes.
export type SpamVerdict = "spam" | "maybe" | undefined;

// Where a buyer pastes a link from (a car, a photo, a map), and the dealer's own website: a link to these is a question about a car.
const SAFE_SITES = ["donedeal.ie", "carzone.ie", "carsireland.ie", "cartell.ie", "motorcheck.ie", "autotrader.ie", "autotrader.co.uk", "facebook.com", "fb.com", "instagram.com", "google.com", "google.ie", "goo.gl", "youtube.com", "youtu.be", "wa.me", "whatsapp.com", "icloud.com", "dropbox.com"];

// The words of sales pitches and scams, never of a car buyer. Each counts once however often it is used.
const TERMS = [
  /\bseo\b/,
  /\bback ?links?\b/,
  /\bguest ?posts?\b/,
  /\blink ?building\b/,
  /\bdomain authority\b/,
  /\b(first|1st|top) page (of|on) google\b/,
  /\brank(ing)? (higher|on google|your (web)?site)\b/,
  /\bweb(site)? (design|development) (services?|agency|company)\b/,
  /\bdigital marketing\b/,
  /\bincrease (your )?(website )?(traffic|sales|leads)\b/,
  /\bwebsite (owner|traffic)\b/,
  /\b(crypto|cryptocurrency|bitcoin|btc|ethereum|usdt|forex|binary options?)\b/,
  /\b(casino|betting|poker|jackpot)\b/,
  /\b(viagra|cialis|porn|xxx)\b/,
  /\b(loan offer|investment opportunity|guaranteed (returns|profits?))\b/,
  /\bunsubscribe\b/,
  /\b(click here|buy now|limited time offer)\b/,
];
// A link written for a forum or a web page: only a bot pastes these into a contact form.
const MARKUP = /\[url=|<a\s+href/i;
const LINK = /\bhttps?:\/\/[^\s<>"\]]+|\bwww\.[^\s<>"\]]+|\b[a-z0-9-]+\.(?:com|net|org|info|biz|xyz|top|site|online|shop|store|io|ru|cn)\b[^\s<>"\]]*/gi;

const hostOf = (link: string) => link.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#:]/)[0].toLowerCase();
const safe = (host: string, own: string[]) => [...SAFE_SITES, ...own].some((s) => host === s || host.endsWith(`.${s}`));

// `ownSite`: the dealer's website address, so a link to one of their own cars is never a sign of spam.
export function spamCheck(lead: { name: string; message: string }, ownSite?: string): SpamVerdict {
  const own = ownSite ? [hostOf(ownSite)] : [];
  // Email addresses are taken out first: "my email is mary@gmail.com" is no link.
  const text = `${lead.name}\n${lead.message}`.replace(/\S+@\S+/g, " ");
  if (MARKUP.test(text)) return "spam";
  const links = (text.match(LINK) ?? []).map(hostOf).filter((h) => !safe(h, own));
  if ((lead.name.replace(/\S+@\S+/g, " ").match(LINK) ?? []).length) return "spam"; // a name is never a web address
  const lower = text.toLowerCase();
  const hits = TERMS.filter((t) => t.test(lower)).length;
  if ((links.length >= 1 && hits >= 1) || hits >= 2 || links.length >= 3) return "spam";
  return links.length >= 1 || hits >= 1 ? "maybe" : undefined;
}
