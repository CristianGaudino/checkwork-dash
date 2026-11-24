import { FUEL_LABELS, GEARBOX_LABELS, forSale, isSold, type Car, type Fuel, type Gearbox } from "@/lib/stock/types";
import { readLead } from "@/lib/leads/lead-text";
import { askedCar, closestCars, readVisit, wantOf } from "@/lib/leads/journey";
import { leadChips } from "@/components/admin/LeadKind";
import { carFacts } from "@/lib/admin/marketing";
import { adminCars } from "@/lib/admin/stock-admin";
import { getSettings, leadsStore, LEAD_TYPE_LABELS, reviewsStore, type Lead } from "@/lib/admin/collections";
import { noContacts, type CarFacts, type FactsOf, type VisitFacts, type WriteRequest } from "./tasks";
import { firstName } from "@/lib/whatsapp/rules";
import { replyLink, replyPrice } from "@/lib/leads/first-reply";
import { enabledModules } from "@/lib/modules";

const num = (s: string | undefined) => (s && Number.isFinite(Number(s)) && Number(s) > 0 ? Number(s) : undefined);
const text = (s: string | undefined, max = 80) => s?.trim().slice(0, max) || undefined;
// The car form's boxes, as typed (they may not be saved yet).
export function formCarFacts(f: Record<string, string>): CarFacts | null {
  const make = text(f.make);
  const model = text(f.model);
  if (!make || !model) return null;
  const year = num(f.year);
  const label = <T extends string>(map: Record<T, string>, v?: string) => (v && v in map ? map[v as T] : undefined);
  return {
    name: [year, make, model, text(f.variant)].filter(Boolean).join(" "),
    year, mileageKm: num(f.mileageKm), fuel: label<Fuel>(FUEL_LABELS, f.fuel), gearbox: label<Gearbox>(GEARBOX_LABELS, f.gearbox), body: text(f.bodyType), engineLitres: num(f.engineLitres),
    colour: text(f.colour), doors: num(f.doors), seats: num(f.seats), owners: num(f.owners), nctExpiry: text(f.nctExpiry, 7),
    features: (f.features ?? "").split("\n").map((x) => x.trim().slice(0, 60)).filter(Boolean).slice(0, 20),
  };
}

// What the lead said: their own words, cut, and the form's other answers (budget, finance terms, best time), never a contact (#59).
function said(lead: Lead): { message: string; details?: Record<string, string> } {
  const { text, facts } = readLead(lead);
  const details = Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, noContacts(v).slice(0, 60)]));
  return { message: noContacts(text).slice(0, 600), ...(Object.keys(details).length > 0 && { details }) };
}

// Builds what a task may see from the records. The browser sends ids (and, for a car being edited, the form's own boxes); never the facts.
type Built = { [K in WriteRequest["task"]]: { task: K; facts: FactsOf[K] } }[WriteRequest["task"]];
// `dealer`: the dealer's name; `siteUrl`: their website, for the cars' links.
export async function buildFacts(req: WriteRequest, dealer: string, siteUrl: string): Promise<Built | null> {
  const { marketing: voice } = await getSettings();
  const v = { signOff: voice.signOff, hashtags: voice.hashtags };
  switch (req.task) {
    case "post": {
      const car = askedCar((await adminCars()).filter(forSale), req.carSlug);
      return car ? { task: "post", facts: { dealer, car: carFacts(car, siteUrl), network: req.network, format: req.format, layout: req.layout, voice: v } } : null;
    }
    case "carDescription": {
      const car = formCarFacts(req.fields);
      return car ? { task: "carDescription", facts: { dealer, car, notes: text(noContacts(req.fields.description ?? ""), 600) } } : null;
    }
    case "leadReply": {
      const lead = await leadsStore.get(req.leadId);
      if (!lead) return null;
      // The car's own details, so the reply can answer "is it still there, what mileage" instead of "I'll check". Its price and link as
      // the first reply gives them (#160): none for a sold or reserved car or one on request, and no link to a page the website does not show.
      const car = askedCar(await adminCars(), lead.carSlug);
      const price = car && replyPrice(car);
      const carDetails = car && { ...carFacts(car, siteUrl), price, ...(!price && { was: undefined }), link: replyLink(car, siteUrl, await enabledModules()), forSale: forSale(car), ...(car.reserved && !isSold(car) && { reserved: true as const }) };
      return { task: "leadReply", facts: { dealer, firstName: firstName(lead.name, ""), kind: LEAD_TYPE_LABELS[lead.type], type: lead.type, ...said(lead), car: lead.carTitle, carDetails } };
    }
    case "leadBrief": {
      const lead = await leadsStore.get(req.leadId);
      if (!lead?.journey) return null;
      const stock = await adminCars();
      const { cars, viewed, pattern, searches, tools } = readVisit(lead.journey, stock, lead);
      const asked = askedCar(stock, lead.carSlug);
      const closest = closestCars(stock, wantOf(asked, viewed, lead.journey.searches), forSale, asked ? [asked.id] : []);
      const visit: VisitFacts = {
        ...(lead.channel && { from: lead.channel }),
        minutes: lead.journey.minutes,
        // Only cars with a name: an id means nothing to the writer.
        cars: cars.flatMap((v) => (v.name ? [{ name: v.name, views: v.views, ...(v.asked && { askedAbout: true as const }), ...(v.car && isSold(v.car) && { sold: true as const }) }] : [])),
        ...(pattern && noContacts(pattern) === pattern && { pattern }), // the pattern is built from the same search words
        // A make or model from an edited address could be a phone number: such a word is left out.
        searches: searches.map((w) => w.filter((x) => noContacts(x) === x)).filter((w) => w.length > 0),
        tools,
      };
      // The few specs a call needs, not the whole listing.
      const brief = (c: Car): CarFacts => (({ name, year, mileageKm, fuel, gearbox, body, price }) => ({ name, year, mileageKm, fuel, gearbox, body, price }))(carFacts(c, siteUrl));
      return {
        task: "leadBrief",
        facts: { dealer, kind: LEAD_TYPE_LABELS[lead.type], type: lead.type, tags: leadChips(lead.type, lead.topic, lead.answers), ...said(lead), car: lead.carTitle, ...(asked && { carForSale: forSale(asked) }), visit, closest: closest.map(brief) },
      };
    }
    case "reviewReply": {
      const r = await reviewsStore.get(req.reviewId);
      return r ? { task: "reviewReply", facts: { dealer, firstName: firstName(r.author, ""), rating: r.rating, text: noContacts(r.text).slice(0, 600) } } : null;
    }
  }
}
