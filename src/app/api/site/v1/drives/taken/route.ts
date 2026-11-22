import { siteRequest } from "@/lib/site-api/request";
import { takenAnswer } from "@/lib/site-api/taken";

// The test drive times already booked for a car (docs/site-api.md), so the website's form can hide them. The website key decides the dealer.
export const dynamic = "force-dynamic";
export const GET = (req: Request) => siteRequest(req, "drives", () => takenAnswer(new URL(req.url)));
