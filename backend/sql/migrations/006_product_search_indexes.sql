-- ==============================================================================
-- Migration 006: Phase 6 - Product Search, Matching & Full-Text Indexes
-- MarketTwin Demand-Driven Marketplace Platform
-- ==============================================================================

-- Enable pg_trgm extension for fuzzy trigram text search if available
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create functional B-tree and lower-case indexes for fast keyword and filter lookup
CREATE INDEX IF NOT EXISTS idx_products_name_lower ON public.products (lower(name));
CREATE INDEX IF NOT EXISTS idx_products_sku_lower ON public.products (lower(sku));
CREATE INDEX IF NOT EXISTS idx_products_category_lower ON public.products (lower(category));

-- Full-text search index across name, description, category and specs
CREATE INDEX IF NOT EXISTS idx_products_fts ON public.products USING gin (
    to_tsvector('english',
        COALESCE(name, '') || ' ' ||
        COALESCE(description, '') || ' ' ||
        COALESCE(category, '') || ' ' ||
        COALESCE(sku, '')
    )
);

-- Comments
COMMENT ON INDEX idx_products_name_lower IS 'Fast case-insensitive search on product names';
COMMENT ON INDEX idx_products_sku_lower IS 'Fast case-insensitive search on product model / SKU';
COMMENT ON INDEX idx_products_fts IS 'GIN full-text search index across title, description, category and model';
