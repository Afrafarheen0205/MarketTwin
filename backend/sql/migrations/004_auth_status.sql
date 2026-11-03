-- Phase 4: merchant verification status alignment
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
BEGIN
    v_role := COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer');
    INSERT INTO public.profiles (id, email, full_name, role, company)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        v_role,
        NEW.raw_user_meta_data->>'company'
    )
    ON CONFLICT (id) DO NOTHING;

    IF v_role = 'customer' THEN
        INSERT INTO public.customer_profiles (id, status) VALUES (NEW.id, 'Active') ON CONFLICT (id) DO NOTHING;
    ELSIF v_role = 'merchant' THEN
        INSERT INTO public.merchant_profiles (id, contact_name, category, status)
        VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.raw_user_meta_data->>'category', 'PENDING')
        ON CONFLICT (id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;