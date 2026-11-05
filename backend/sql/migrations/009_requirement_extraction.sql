CREATE TABLE IF NOT EXISTS public.demand_normalized_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    demand_id UUID NOT NULL REFERENCES public.demands(id) ON DELETE CASCADE,
    extraction_version TEXT NOT NULL DEFAULT 'v1',
    product_type TEXT,
    normalized_product_name TEXT,
    normalized_category TEXT,
    normalized_material TEXT,
    normalized_specifications JSONB NOT NULL DEFAULT '{}'::jsonb,
    normalized_dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
    mandatory_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
    optional_preferences JSONB NOT NULL DEFAULT '[]'::jsonb,
    commercial_constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
    delivery_constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
    missing_information JSONB NOT NULL DEFAULT '[]'::jsonb,
    clarification_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    confidence_score NUMERIC NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    reviewed_by UUID REFERENCES public.profiles(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (demand_id, extraction_version)
);

CREATE INDEX IF NOT EXISTS idx_normalized_requirements_demand ON public.demand_normalized_requirements(demand_id);
CREATE INDEX IF NOT EXISTS idx_normalized_requirements_status ON public.demand_normalized_requirements(status);

ALTER TABLE public.demand_normalized_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS normalized_requirements_admin_all ON public.demand_normalized_requirements;
CREATE POLICY normalized_requirements_admin_all ON public.demand_normalized_requirements FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS normalized_requirements_customer_select ON public.demand_normalized_requirements;
CREATE POLICY normalized_requirements_customer_select ON public.demand_normalized_requirements FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.demands d WHERE d.id = demand_normalized_requirements.demand_id AND d.customer_id = auth.uid())
);