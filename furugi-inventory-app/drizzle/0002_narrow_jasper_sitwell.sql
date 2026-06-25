DROP INDEX `idx_products_management_number`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_management_number` ON `products` (`management_number`);