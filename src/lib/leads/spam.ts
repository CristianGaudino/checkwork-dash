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

// The host a browser would open: past any "name:password@" in front of it, and a "\" ends it as "/" does, so "https://wa.me:x@evil.xyz"
// and "https://evil.xyz\@wa.me" are both evil.xyz.
const hostOf = (link: string) => link.replace(/^https?:\/\//i, "").split(/[/\\?#]/)[0].replace(/^.*@/, "").split(":")[0].replace(/^www\./i, "").toLowerCase();
const safe = (host: string, own: string[]) => [...SAFE_SITES, ...own].some((s) => host === s || host.endsWith(`.${s}`));
const noEmails = (s: string) => s.replace(/(?<![\w.+-]|(?:\/\/|\bwww\.)\S*)[\w.+-]+@[\w-]+(\.[\w-]+)+/g, " "); // "Email:mary@gmail.com" is no link; nothing inside a link ("https://wa.me:a.b@evil.xyz") is taken for an email

// Clear spam only on what no person types into a contact form: forum or web page link markup. Words and links are only ever a hint
// (Possible spam): a real buyer signs off with a job title, mentions crypto, links another dealer or puts their company site as their
// name, and a person decides in one tap. `ownSite`: the dealer's website, so a link to their car is no hint.
export function spamCheck(lead: { name: string; message: string }, ownSite?: string): SpamVerdict {
  const own = ownSite ? [hostOf(ownSite)] : [];
  const message = noEmails(lead.message);
  if (MARKUP.test(`${lead.name}\n${message}`)) return "spam";
  const links = (message.match(LINK) ?? []).map(hostOf).filter((h) => !safe(h, own));
  const hits = TERMS.filter((t) => t.test(message.toLowerCase())).length;
  return links.length >= 1 || hits >= 1 || noEmails(lead.name).match(LINK) ? "maybe" : undefined;
}
