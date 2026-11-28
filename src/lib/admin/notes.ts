import { currentMember } from "@/lib/permissions";
import { NOTE_MAX } from "./note-max";

// A note on a lead, order or claim, and the one way it is added. `by` is the team member who wrote it; the site's own notes have `auto`.
export type Note = { at: number; text: string; by?: string; auto?: true };
type Noted = { notes: Note[] };

// Adds the form's note through the store's safe read-modify-write, signed with who added it. Undefined when there is no note or the record
// is gone, so the caller logs nothing. The caller checks staff first, and logs the activity without the note's text.
export async function appendNote<T extends Noted>(store: { update(id: string, fn: (doc: T) => T | Promise<T>): Promise<T | undefined> }, id: string, data: FormData): Promise<T | undefined> {
  const text = String(data.get("note") ?? "").trim().slice(0, NOTE_MAX);
  if (!text) return;
  const by = (await currentMember()).name || undefined;
  return store.update(id, (d) => ({ ...d, notes: [...d.notes, { at: Date.now(), text, ...(by && { by }) }] }));
}
