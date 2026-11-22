// The spam check on a lead as it arrives (#56). Rules only, no outside service, and nothing is logged. Careful by design, so a real
// customer is never filed as spam: a name in any language, a short or empty message, no phone, links to cars or photos, and the odd
// word a buyer might use are all normal. Clear spam ("spam") needs strong evidence; a hint of it is "maybe" (Possible spam: it stays in
// To answer now for a person to decide); anything else passes.
export type SpamVerdict = "spam" | "maybe" | undefined;

// Where a buyer pastes a link from (a car, a photo, a map, a chat), and the dealer's own website: a link to these is no sign of spam.
const SAFE_SITES = [
  ...["donedeal.ie", "carzone.ie", "carsireland.ie", "adverts.ie", "cartell.ie", "motorcheck.ie", "autotrader.ie", "autotrader.co.uk", "autotrader.com", "cargurus.ie", "cargurus.co.uk", "cargurus.com", "motors.co.uk", "carsales.com", "carsales.com.au", "pistonheads.com", "gumtree.ie", "gumtree.com", "mobile.de", "autoscout24.com", "autoscout24.de", "autoscout24.ie"],
  ...["imgur.com", "photos.google.com", "photos.app.goo.gl", "maps.app.goo.gl", "icloud.com", "dropbox.com", "wetransfer.com", "we.tl", "flickr.com"],
  ...["facebook.com", "fb.com", "instagram.com", "maps.google.com", "maps.google.ie", "youtube.com", "youtu.be", "wa.me", "whatsapp.com"],
];

// The words of sales pitches and scams, never of a car buyer. Each counts once however often it is used. Read in the message only,
// never the name (a name like Seo-yeon is a name). Not "SEO" alone or "unsubscribe": a buyer signs off with a job title ("Head of SEO"),
// a surname (Seo) or a mailing footer.
const TERMS = [
  /\bseo (services?|audits?|agency|agencies|experts?|packages?)\b/,
  /\bback ?links?\b/,
  /\bguest ?posts?\b/,
  /\blink ?building\b/,
  /\bdomain authority\b/,
  /\b(first|1st|top) page (of|on) google\b/,
  /\brank(ing)? (higher|on google|your (web)?site)\b/,
  /\bweb(site)? (design|development) (services?|agency|company)\b/,
  /\bdigital marketing\b/,
  /\bincrease (your )?(website )?traffic\b/,
  /\bwebsite (owner|traffic)\b/,
  /\b(crypto|cryptocurrency|bitcoin|usdt|forex|binary options?)\b/,
  /\b(casino|poker|jackpot)\b/,
  /\b(viagra|cialis)\b/,
  /\b(investment opportunity|guaranteed (returns|profits?))\b/,
];
// A link written for a forum or a web page: only a bot pastes these into a contact form.
const MARKUP = /\[url=|<a\s+href/i;
const LINK = /\bhttps?:\/\/[^\s<>"\]]+|\bwww\.[^\s<>"\]]+|\b[a-z0-9-]+\.(?:com|net|org|info|biz|xyz|top|site|online|shop|store|io|ru|cn)\b[^\s<>"\]]*/gi;

const hostOf = (link: string) => link.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#:]/)[0].toLowerCase();
const safe = (host: string, own: string[]) => [...SAFE_SITES, ...own].some((s) => host === s || host.endsWith(`.${s}`));
const noEmails = (s: string) => s.replace(/(?<![/\w])[\w.+-]+@[\w-]+(\.[\w-]+)+/g, " "); // "my email is mary@gmail.com" is no link; "https://x@evil.xyz" still is

// Clear spam: forum or web page link markup; a name that is only a web address ("Pat Kelly, KellyAuto.com" is a trade buyer: maybe); or a pitch, two of its words or more, with a link to an unknown
// site. Possible spam: one pitch word, or a link to an unknown site. `ownSite`: the dealer's website, so a link to their car is fine.
export function spamCheck(lead: { name: string; message: string }, ownSite?: string): SpamVerdict {
  const own = ownSite ? [hostOf(ownSite)] : [];
  const message = noEmails(lead.message);
  if (MARKUP.test(`${lead.name}\n${message}`)) return "spam";
  const name = noEmails(lead.name).trim();
  if (/^\S+$/.test(name) && name.match(LINK)) return "spam"; // a name is never only a web address
  const links = (message.match(LINK) ?? []).map(hostOf).filter((h) => !safe(h, own));
  const hits = TERMS.filter((t) => t.test(message.toLowerCase())).length;
  if (hits >= 2 && links.length >= 1) return "spam";
  return links.length >= 1 || hits >= 1 || name.match(LINK) ? "maybe" : undefined;
}
