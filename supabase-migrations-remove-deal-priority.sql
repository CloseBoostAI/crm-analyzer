-- Remove priority column from deals table
-- Run in Supabase SQL Editor if you want to clean up the schema

ALTER TABLE public.deals DROP COLUMN IF EXISTS priority;
