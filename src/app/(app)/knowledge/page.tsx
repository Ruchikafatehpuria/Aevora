import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { excerpt } from "@/lib/knowledge/shared";
import { PageHeader } from "@/components/shell/page-header";
import { KnowledgeView, type NoteFilter, type NoteListItem } from "@/components/knowledge/knowledge-view";

export const metadata = { title: "Knowledge" };

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; tag?: string; note?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 200);
  const filter: NoteFilter = sp.f === "notes" || sp.f === "links" || sp.f === "pinned" ? sp.f : "all";
  const tag = sp.tag?.trim().toLowerCase().slice(0, 30) || null;

  const where: Prisma.NoteWhereInput = {
    userId: user.id,
    ...(filter === "notes" ? { url: null } : filter === "links" ? { url: { not: null } } : filter === "pinned" ? { pinned: true } : {}),
    ...(tag ? { tags: { has: tag } } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { body: { contains: q, mode: "insensitive" } },
            { url: { contains: q, mode: "insensitive" } },
            { tags: { has: q.toLowerCase().replace(/^#/, "") } },
          ],
        }
      : {}),
  };

  const [notes, tagRows, total, selected] = await Promise.all([
    db.note.findMany({ where, orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }], take: 500 }),
    db.$queryRaw<{ tag: string; n: number }[]>`SELECT t AS tag, COUNT(*)::int AS n FROM "notes", unnest(tags) AS t WHERE "userId" = ${user.id} GROUP BY t ORDER BY n DESC, t ASC LIMIT 40`,
    db.note.count({ where: { userId: user.id } }),
    sp.note ? db.note.findFirst({ where: { id: sp.note, userId: user.id } }) : null,
  ]);

  const list: NoteListItem[] = notes.map((n) => ({
    id: n.id,
    title: n.title,
    excerpt: n.sensitive ? "" : excerpt(n.body),
    url: n.url,
    tags: n.tags,
    pinned: n.pinned,
    sensitive: n.sensitive,
    updatedAt: n.updatedAt.toISOString(),
  }));

  return (
    <>
      <PageHeader title="Knowledge" description="Notes, saved links and ideas in one searchable place. The assistant can use them too." />
      <KnowledgeView
        notes={list}
        tags={tagRows}
        total={total}
        q={q}
        filter={filter}
        tag={tag}
        selected={
          selected
            ? { id: selected.id, title: selected.title, body: selected.body, url: selected.url, tags: selected.tags, pinned: selected.pinned, sensitive: selected.sensitive, updatedAt: selected.updatedAt.toISOString(), createdAt: selected.createdAt.toISOString() }
            : null
        }
        missing={!!sp.note && !selected}
      />
    </>
  );
}
