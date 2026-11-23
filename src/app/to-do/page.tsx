import { EmptyState, PageHeader, Panel, TaskList } from "@/components/admin/kit";
import { CheckIcon } from "@/components/stock/icons";
import { plural } from "@/lib/admin/format";
import { WhoseToggle, loadToDo } from "@/components/admin/ToDo";

export const metadata = { title: "To do" };

// The Overview's To do, every row: its See all opens it here, so the Overview keeps its length. Its own page rather than a sheet: the
// sheet is for phones and shuts from 1024px, and See all is there on a desktop too.
export default async function Page({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const { tasks, count, mine, me } = await loadToDo((await searchParams).mine);
  return (
    <>
      <PageHeader title="To do" text={count ? plural(count, "to-do") : undefined} back={{ href: `/?mine=${mine ? 1 : 0}`, label: "Overview" }} actions={me.name && <WhoseToggle path="/to-do" mine={mine} />} />
      <Panel>
        {tasks.length === 0 ? <EmptyState compact icon={<CheckIcon />} title="All done" text="Nothing is waiting on you. New leads and bookings show here as they come in." /> : <TaskList label="To do">{tasks}</TaskList>}
      </Panel>
    </>
  );
}
