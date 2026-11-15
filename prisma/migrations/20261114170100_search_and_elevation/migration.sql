ALTER TABLE "Session" ADD COLUMN "elevatedUntil" TIMESTAMP(3);

-- array_to_string is only STABLE; index expressions need IMMUTABLE. Joining text with a space is immutable in practice.
CREATE OR REPLACE FUNCTION syncly_join_tags(tags text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT coalesce(array_to_string(tags, ' '), '') $$;

-- Full-text search over file names, tags, metadata and extracted text.
CREATE INDEX "imported_files_fts_idx" ON "imported_files" USING GIN (
  to_tsvector('simple'::regconfig,
    coalesce("displayName", '') || ' ' || coalesce("category", '') || ' ' || coalesce("subject", '') || ' ' ||
    coalesce("project", '') || ' ' || syncly_join_tags("tags") || ' ' || coalesce(left("extractedText", 200000), ''))
);
