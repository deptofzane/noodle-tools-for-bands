ALTER TABLE "notifications" ADD COLUMN "upload_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- Recover the count from the label it used to live in. Anything that isn't
-- our own "N uploads" format is a rollup named after its single file, worth
-- one — the same reading the old `labelCount` did, run once instead of on
-- every upload.
UPDATE "notifications" SET "upload_count" = CASE
    WHEN "subject_label" ~ '^[0-9]+ uploads?$'
      THEN split_part("subject_label", ' ', 1)::int
    ELSE 1
  END
  WHERE "kind" = 'audio-added' AND "subject_id" IS NULL;--> statement-breakpoint
-- Any day that already has two rollups (the race this migration closes) has
-- to become one before the unique index can exist. Fold the group into its
-- newest row: the counts sum, and a day several people contributed to loses
-- the name, exactly as it would have had the writes been serialized.
UPDATE "notifications" AS n SET
    "upload_count" = g.total,
    "subject_label" = g.total || ' uploads',
    "multi_actor" = g.multi
  FROM (
    SELECT
      sum("upload_count")::int AS total,
      (bool_or("multi_actor") OR count(DISTINCT "actor_id") > 1) AS multi,
      (array_agg("id" ORDER BY "created_at" DESC, "id" DESC))[1] AS keep_id
    FROM "notifications"
    WHERE "kind" = 'audio-added' AND "subject_id" IS NULL AND "day" IS NOT NULL
    GROUP BY "band_id", "day"
    HAVING count(*) > 1
  ) AS g
  WHERE n."id" = g.keep_id;--> statement-breakpoint
DELETE FROM "notifications" AS n USING (
    SELECT "id", row_number() OVER (
      PARTITION BY "band_id", "day" ORDER BY "created_at" DESC, "id" DESC
    ) AS rn
    FROM "notifications"
    WHERE "kind" = 'audio-added' AND "subject_id" IS NULL AND "day" IS NOT NULL
  ) AS d
  WHERE n."id" = d."id" AND d.rn > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_band_day_rollup_unique" ON "notifications" USING btree ("band_id","day") WHERE "notifications"."kind" = 'audio-added' and "notifications"."subject_id" is null;
