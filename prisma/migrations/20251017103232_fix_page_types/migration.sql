-- Fix existing pages without type field
UPDATE "Page" SET type = 'document' WHERE type IS NULL OR type = '';
