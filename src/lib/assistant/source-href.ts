import type { Source } from "./answer";

/** Where a cited source opens: a note in Knowledge, or a file in My Files. */
export const sourceHref = (s: Pick<Source, "fileId" | "kind">) => (s.kind === "note" ? `/knowledge?note=${s.fileId}` : `/locker/files/${s.fileId}`);
