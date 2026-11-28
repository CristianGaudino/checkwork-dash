import { notFound } from "next/navigation";
import { PageHeader, StatCard, StatGrid } from "@/components/admin/kit";
import { PostComposer } from "@/components/admin/PostComposer";
import { PostPreview } from "@/components/admin/PostPreview";
import { BrandIcon } from "@/components/admin/BrandIcon";
import { postName, prepared } from "@/components/admin/PostNow";
import { carCards } from "@/lib/admin/car-cards";
import { mediaStore, postsStore } from "@/lib/admin/collections";
import { dublinDateTime, fmtDateTime, fmtNum } from "@/lib/admin/format";
import { newestForSale, worthPosting } from "@/lib/admin/marketing";
import { adminCars } from "@/lib/admin/stock-admin";
import { slugId } from "@/lib/admin/stock-admin-pure";
import { composeAction, composerCarAction } from "../../actions";

const back = { href: "/marketing", label: "Marketing" };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const post = await postsStore.get((await params).id);
  return { title: post?.status === "posted" ? "Post" : "Edit post" };
}

// One post. A draft or a scheduled one opens in the composer, filled in from what was saved, on its words and photos; saving updates it, and
// posting or scheduling works as from a new one. One that went out is shown as it went, with how it did: it is never changed.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const post = await postsStore.get((await params).id);
  if (!post) notFound();
  const name = postName(post);
  const title = name.charAt(0).toUpperCase() + name.slice(1);

  if (post.status === "posted") {
    const held = prepared(post);
    return (
      <>
        <PageHeader title={title} text={[post.carTitle, held ? `Waiting for ${post.network}` : `Posted ${fmtDateTime(post.postedAt ?? post.createdAt)}`].filter(Boolean).join(", ")} back={back} />
        <div className="grid grid-cols-1 items-start gap-6 wide:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <figure aria-label="Post" className="flex min-w-0 flex-col overflow-hidden rounded-card border border-hairline bg-card">
            <figcaption className="flex items-center gap-1.5 px-4 py-3 text-meta font-medium"><BrandIcon name={post.network} />{title}</figcaption>
            <div className="px-4 pb-4">
              <PostPreview network={post.network} format={post.format ?? "post"} layout={post.layout} text={post.text} photos={post.photos ?? []} video={post.video} title={post.carTitle ?? ""} />
            </div>
          </figure>
          {/* Held until the network approves us: it has not gone out, so no figures. */}
          {!held && (
            <StatGrid>
              <StatCard label="People who saw it" value={fmtNum(post.reach ?? 0)} />
              <StatCard label="Clicks to your site" value={fmtNum(post.clicks ?? 0)} />
            </StatGrid>
          )}
        </div>
      </>
    );
  }

  const [cars, posts, library] = await Promise.all([adminCars(), postsStore.list(), mediaStore.list()]);
  const onSale = newestForSale(cars);
  // As on New post: the cars worth a post first, with the reason on their card.
  const ideas = new Map<string, string>(worthPosting(onSale, posts).map((i) => [i.car.slug, i.reason]));
  const cards = carCards([...onSale.filter((c) => ideas.has(c.slug)), ...onSale.filter((c) => !ideas.has(c.slug))], ideas);
  // By id: the car may have been edited since, which gives it a new slug. A car no longer for sale is not there, so the composer asks for one.
  const car = post.carSlug ? cards.find((c) => slugId(c.slug) === slugId(post.carSlug!)) : undefined;
  return (
    <>
      <PageHeader title="Edit post" text={[title, post.status === "scheduled" && post.scheduledFor ? `goes out ${fmtDateTime(post.scheduledFor)}` : "draft"].join(", ")} back={back} />
      <PostComposer
        cars={cards}
        initialSlug={car?.slug ?? ""}
        post={{
          id: post.id,
          network: post.network,
          format: post.format ?? "post",
          layout: post.layout,
          photos: post.photos ?? [],
          video: post.video,
          text: post.text,
          // datetime-local's form, in Irish time, which is how the action reads it back.
          when: post.status === "scheduled" && post.scheduledFor ? dublinDateTime(post.scheduledFor).replace(" ", "T") : undefined,
        }}
        library={library.map(({ id, kind, src, name, durationSec, carSlug }) => ({ id, kind, src, name, durationSec, carSlug }))}
        action={composeAction}
        load={composerCarAction}
      />
    </>
  );
}
