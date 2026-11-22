import { doUnsubscribe, showUnsubscribe } from "@/lib/site-api/unsubscribe";

export const dynamic = "force-dynamic";
export const GET = showUnsubscribe;
export const POST = doUnsubscribe; // the button, and RFC 8058's one-click POST (its body is not read: the signed link says everything)
