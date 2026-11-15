DROP INDEX IF EXISTS "imported_files_fts_idx";
CREATE INDEX "imported_files_fts_idx" ON "imported_files" USING GIN (
  to_tsvector('simple'::regconfig,
    coalesce("displayName", '') || ' ' || coalesce("category", '') || ' ' || coalesce("subject", '') || ' ' ||
    coalesce("project", '') || ' ' || syncly_join_tags("tags") || ' ' || coalesce("description", '') || ' ' ||
    coalesce(left("extractedText", 200000), ''))
);
