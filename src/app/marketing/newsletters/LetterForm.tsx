import { Panel, adminButton } from "@/components/admin/kit";
import { NewsletterFields } from "@/components/admin/NewsletterFields";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { createNewsletterAction } from "../actions";

// A newsletter draft to check and save: a new one written from the newest cars, or a saved draft (`id`), which saving updates.
export function LetterForm({ id, subject, body }: { id?: string; subject: string; body: string }) {
  return (
    <Panel>
      <form action={createNewsletterAction} className="flex flex-col gap-4">
        {id && <input type="hidden" name="id" value={id} />}
        <NewsletterFields subject={subject} body={body} />
        <SubmitButton name="intent" value="save" className={`${adminButton} self-end`}>Save draft</SubmitButton>
      </form>
    </Panel>
  );
}
