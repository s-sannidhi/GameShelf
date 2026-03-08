CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text,
	`name` text NOT NULL,
	`platform` text DEFAULT 'Other' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`cover_url` text,
	`description` text,
	`release_date` text,
	`genres` text,
	`playtime_minutes` integer,
	`completed_at` text,
	`rating` integer,
	`notes` text,
	`store_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`external_user_id` text NOT NULL,
	`last_synced_at` text NOT NULL,
	`games_count` integer NOT NULL
);
