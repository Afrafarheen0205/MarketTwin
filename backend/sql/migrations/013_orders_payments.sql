CREATE TABLE IF NOT EXISTS public.payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES public.payments(id) ON DELETE CASCADE,
    provider_event_id TEXT,
    event_type TEXT,
    event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    verification_status TEXT NOT NULL DEFAULT 'pending',
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_payment ON public.payment_events(payment_id);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_events_admin ON public.payment_events;
CREATE POLICY payment_events_admin ON public.payment_events FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Ensure orders has selection_id
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS selection_id UUID REFERENCES public.customer_offer_selections(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'Not Initiated';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_status TEXT NOT NULL DEFAULT 'Pending Payment';