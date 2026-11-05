-- Phase 9: demand grouping engine

ALTER TABLE public.demand_groups ADD COLUMN IF NOT EXISTS group_reference TEXT;
ALTER TABLE public.demand_groups ADD COLUMN IF NOT EXISTS normalized_product_type TEXT;
ALTER TABLE public.demand_groups ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id);
ALTER TABLE public.demand_groups ADD COLUMN IF NOT EXISTS group_status TEXT NOT NULL DEFAULT 'Proposed';
ALTER TABLE public.demand_groups ADD COLUMN IF NOT EXISTS total_requested_quantity NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.demand_groups ADD COLUMN IF NOT EXISTS participating_demand_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.demand_groups ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE public.demand_groups ADD COLUMN IF NOT EXISTS compatibility_summary JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.demand_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.demand_groups ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.demand_groups ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id);

-- Backfill group_reference
UPDATE public.demand_groups SET group_reference = group_code WHERE group_reference IS NULL;

-- demand_group_members enhancements
ALTER TABLE public.demand_group_members ADD COLUMN IF NOT EXISTS demand_id UUID REFERENCES public.demands(id);
ALTER TABLE public.demand_group_members ADD COLUMN IF NOT EXISTS original_target_price NUMERIC;
ALTER TABLE public.demand_group_members ADD COLUMN IF NOT EXISTS original_budget NUMERIC;
ALTER TABLE public.demand_group_members ADD COLUMN IF NOT EXISTS membership_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.demand_group_members ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

-- demand_group_runs
CREATE TABLE IF NOT EXISTS public.demand_group_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_status TEXT NOT NULL DEFAULT 'completed',
    triggered_by UUID REFERENCES public.profiles(id),
    total_demands_processed INTEGER NOT NULL DEFAULT 0,
    total_groups_proposed INTEGER NOT NULL DEFAULT 0,
    execution_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- demand_group_reviews
CREATE TABLE IF NOT EXISTS public.demand_group_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.demand_groups(id) ON DELETE CASCADE,
    reviewed_by UUID NOT NULL REFERENCES public.profiles(id),
    action TEXT NOT NULL,
    review_notes TEXT,
    previous_status TEXT,
    new_status TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demand_group_members_group ON public.demand_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_demand_group_members_demand ON public.demand_group_members(demand_id);
CREATE INDEX IF NOT EXISTS idx_demand_group_runs_status ON public.demand_group_runs(execution_status);

-- RLS
ALTER TABLE public.demand_group_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demand_group_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS demand_group_runs_admin ON public.demand_group_runs;
CREATE POLICY demand_group_runs_admin ON public.demand_group_runs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS demand_group_reviews_admin ON public.demand_group_reviews;
CREATE POLICY demand_group_reviews_admin ON public.demand_group_reviews FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS demand_group_reviews_customer_select ON public.demand_group_reviews;
CREATE POLICY demand_group_reviews_customer_select ON public.demand_group_reviews FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.demand_group_members m JOIN public.demands d ON d.id = m.demand_id WHERE m.group_id = demand_group_reviews.group_id AND d.customer_id = auth.uid())
);