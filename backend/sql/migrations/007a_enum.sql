-- Phase 7: customer demand creation support

-- Extend demand_status enum
ALTER TYPE demand_status ADD VALUE IF NOT EXISTS 'Submitted';
ALTER TYPE demand_status ADD VALUE IF NOT EXISTS 'Under Review';
ALTER TYPE demand_status ADD VALUE IF NOT EXISTS 'Cancelled';
ALTER TYPE demand_status ADD VALUE IF NOT EXISTS 'Expired';
ALTER TYPE demand_status ADD VALUE IF NOT EXISTS 'Grouped';
ALTER TYPE demand_status ADD VALUE IF NOT EXISTS 'Bidding Open';
ALTER TYPE demand_status ADD VALUE IF NOT EXISTS 'Offers Available';
ALTER TYPE demand_status ADD VALUE IF NOT EXISTS 'Accepted';