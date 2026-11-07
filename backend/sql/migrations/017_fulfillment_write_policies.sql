-- 016_fulfillment_write_policies.sql
--
-- Problem:
--   RLS was enabled on order_status_history and shipments, but only SELECT
--   policies were created in migration 014. Any INSERT from the merchant
--   portal was therefore rejected by PostgREST with HTTP 403.
--
-- Fix:
--   Allow the merchant assigned to an order (and admins) to append status
--   history, create/update shipment records, and add tracking events.
--   Ownership is still enforced at the database level: the row's order must
--   belong to auth.uid().

-- order_status_history: insert for the assigned merchant or an admin
DROP POLICY IF EXISTS osh_insert ON public.order_status_history;
CREATE POLICY osh_insert ON public.order_status_history
FOR INSERT WITH CHECK (
    public.is_admin()
    OR EXISTS (
        SELECT 1
        FROM public.orders o
        WHERE o.id = order_status_history.order_id
          AND o.merchant_id = auth.uid()
    )
);

-- shipments: insert for the assigned merchant or an admin
DROP POLICY IF EXISTS shipments_insert ON public.shipments;
CREATE POLICY shipments_insert ON public.shipments
FOR INSERT WITH CHECK (
    public.is_admin()
    OR EXISTS (
        SELECT 1
        FROM public.orders o
        WHERE o.id = shipments.order_id
          AND o.merchant_id = auth.uid()
    )
);

-- shipments: update for the assigned merchant or an admin
DROP POLICY IF EXISTS shipments_update ON public.shipments;
CREATE POLICY shipments_update ON public.shipments
FOR UPDATE USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1
        FROM public.orders o
        WHERE o.id = shipments.order_id
          AND o.merchant_id = auth.uid()
    )
)
WITH CHECK (
    public.is_admin()
    OR EXISTS (
        SELECT 1
        FROM public.orders o
        WHERE o.id = shipments.order_id
          AND o.merchant_id = auth.uid()
    )
);

-- shipment_tracking_events: insert for the shipment's assigned merchant or an admin
DROP POLICY IF EXISTS ste_insert ON public.shipment_tracking_events;
CREATE POLICY ste_insert ON public.shipment_tracking_events
FOR INSERT WITH CHECK (
    public.is_admin()
    OR EXISTS (
        SELECT 1
        FROM public.shipments s
        JOIN public.orders o ON o.id = s.order_id
        WHERE s.id = shipment_tracking_events.shipment_id
          AND o.merchant_id = auth.uid()
    )
);
