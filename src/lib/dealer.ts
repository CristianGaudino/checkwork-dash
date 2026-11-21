import type { DealerProfile } from "@/lib/tenancy/profile";

// "09:00" -> "9am", "17:30" -> "5:30pm", "12:00" -> "12pm".
const time = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};

export const formatHours = ({ opens, closes }: { opens?: string; closes?: string }) => (opens && closes ? `${time(opens)} to ${time(closes)}` : "Closed");

// The dealer on Google Maps: by the street and town (the eircode alone may be illustrative), and by Google place when its ID is known.
export const directionsUrl = (address: DealerProfile["address"], placeId?: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address.street}, ${address.town}, Ireland`)}${placeId ? `&query_place_id=${encodeURIComponent(placeId)}` : ""}`;
