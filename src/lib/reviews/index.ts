import "server-only";
import { directionsUrl } from "../dealer";
import { currentDealer, dealerProfile } from "../tenancy/current";
import { DEMO_PROFILE } from "../tenancy/profile";
import { devMode } from "../dev-data";
import { createPlacesProvider } from "./places-provider";

// The one place that names a concrete reviews provider (D-01, as src/lib/stock/index.ts).

export type Review = {
  id: string;
  author: string;
  authorUri?: string;
  photoUri?: string;
  rating: number; // integer 1 to 5
  text: string; // may be empty: Google allows rating-only reviews
  relativeTime: string;
  languageCode?: string;
  reviewUri: string;
};

export type Reviews = {
  source: "demo" | "google";
  rating?: number;
  count?: number;
  placeUri: string;
  reviews: Review[];
};

export type ReviewsProvider = { get(): Promise<Reviews | null> };

// The dealer's address on Google Maps, the same search as Get directions: a made-up dealer has no Google listing of its own.
const DEMO_PLACE = directionsUrl(DEMO_PROFILE.address);
// Made-up names, first name and initial as a review site shows them. Real ones come from the Places provider.
const DEMO_AUTHORS = ["Aoife M.", "Conor D.", "Niamh K.", "Sean B.", "Orla R.", "Ciara L.", "Darragh F.", "Emma W.", "Fionn H.", "Grainne T."];
const demo = (n: number, rating: number, text: string, relativeTime: string): Review => ({
  id: `demo-${n}`,
  author: DEMO_AUTHORS[n - 1],
  rating,
  text,
  relativeTime,
  languageCode: "en",
  reviewUri: DEMO_PLACE,
});

// Fictional names, shown without a label until the Places provider is configured, outside production only.
export const DEMO_REVIEWS: Reviews = {
  source: "demo",
  rating: 4.9,
  count: 10,
  placeUri: DEMO_PLACE,
  reviews: [
    demo(1, 5, "Easy to deal with from the first call. The car was ready when we came to collect it.", "3 weeks ago"),
    demo(2, 5, "No pressure at all. They answered every question and let us take our time.", "a month ago"),
    demo(3, 5, "Straightforward buying a car here. Would go back.", "3 months ago"),
    demo(4, 4, "Good choice of cars. Took a while to decide, and nobody rushed me.", "4 months ago"),
    demo(5, 5, "Friendly people and a simple process from start to finish.", "6 months ago"),
    demo(6, 5, "Traded in my old car and the offer was fair. Done in an afternoon.", "7 months ago"),
    demo(7, 5, "They sorted the finance quickly and explained every step.", "9 months ago"),
    demo(8, 5, "The car was exactly as described. Spotless when we picked it up.", "10 months ago"),
    demo(9, 5, "Helpful from the test drive to the handover. Would recommend.", "a year ago"),
    demo(10, 5, "Honest people. Followed up a week later to check all was well.", "a year ago"),
  ],
};

const places = new Map<string, ReviewsProvider>(); // by place ID

// The current dealer's Google place (their profile) and our Places key (a Worker secret, read per call: secrets reach process.env on the
// first request, see env.ts). Missing config means demo, never an error. Once Places is configured its null stands: never fall back to
// fixtures on a live site.
export async function getReviews(): Promise<Reviews | null> {
  if (process.env.NODE_ENV === "development") {
    // break-ui: the dev-only Demo / Worst case switch.
    const mode = await devMode();
    if (mode !== "demo") {
      const dev = (await import("../stock/worst-cars")).worstReviews(mode);
      if (dev !== undefined) return dev;
    }
  }
  const placeId = (await dealerProfile()).placeId;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  // The fixtures are for a demo dealer only (the directory's flag, on any deploy): a real dealer with a missing key or place shows no
  // reviews, never invented ones.
  if (!placeId || !apiKey) return (await currentDealer()).demo ? DEMO_REVIEWS : null;
  if (!places.has(placeId)) places.set(placeId, createPlacesProvider({ placeId, apiKey })); // one per place, so its day memo survives between requests
  return places.get(placeId)!.get();
}
