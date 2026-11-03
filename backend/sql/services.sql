-- Storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('demand-specs', 'demand-specs', false)
ON CONFLICT (id) DO NOTHING;

-- Realtime: add core tables to supabase_realtime publication (guarded)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.demands;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.demand_groups;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.merchant_offers;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;