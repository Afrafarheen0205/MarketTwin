# MarketTwin Database & Supabase Documentation

## Overview
MarketTwin uses Supabase (PostgreSQL) for relational data, authentication, storage, and realtime updates. The schema is managed through SQL migration files in `backend/sql/migrations`.

## Environment Variables

### Backend (`backend/.env`)
```
PROJECT_NAME="MarketTwin API"
ENVIRONMENT="development"
DEBUG=True
API_V1_STR="/api/v1"
ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_KEY="<anon-public-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-secret-key>"
```

### Frontend (`frontend/.env`)
```
VITE_API_BASE_URL=http://localhost:8000
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```

The frontend uses only the anon key. The service-role key is backend-only.

## Migrations
Run all migrations:
```
cd backend
python sql/migrations/run_migration.py
```
Files:
- `001_initial_schema.sql` - core tables, enums, indexes, base RLS
- `002_phase3_expansion.sql` - expanded production tables, columns, RLS
- `003_services.sql` - storage buckets and realtime publication

## Core Tables
User management:
- `profiles` (extends `auth.users`)
- `customer_profiles`
- `merchant_profiles`
- `user_roles`

Product management:
- `categories`
- `products`
- `product_images`

Demand management:
- `demands`
- `demand_requirements`
- `demand_groups`
- `demand_group_members`

Merchant management:
- `merchant_verifications`
- `merchant_categories`

Offer management:
- `merchant_offers`
- `offer_items`
- `offer_eligibility`

Order management:
- `orders`
- `order_items`
- `payments`
- `fulfillment_milestones`

Platform management:
- `notifications`
- `platform_settings`
- `audit_logs`

## Key Relationships
- `profiles.id` references `auth.users.id`
- `demands.customer_id` references `profiles.id`
- `demands.group_id` references `demand_groups.id`
- `demand_group_members` links customers to demand groups
- `merchant_offers.demand_id` references `demands.id`
- `merchant_offers.merchant_id` references `profiles.id`
- `offer_eligibility` links offers to customers
- `orders.accepted_offer_id` references `merchant_offers.id`
- `order_items.order_id` references `orders.id`
- `payments.order_id` references `orders.id`
- `fulfillment_milestones.order_id` references `orders.id`

## Security
- RLS is enabled on all application tables.
- Customers can access only their own profile, demands, orders, payments, and authorized offers.
- Merchants can view anonymized demand data and manage only their own offers and fulfillment records.
- Admin access is role-based through `profiles.role` and `is_admin()`.
- Service-role key is never exposed to the frontend.

## Auth Integration
- Supabase Auth manages users.
- `handle_new_user` trigger creates `profiles` and role-specific profile rows on signup.
- Frontend auth helpers: `frontend/src/services/authService.ts`
- Backend JWT verification: `backend/app/core/security.py` (`get_current_user`, `require_roles`)

## Storage
Buckets:
- `product-images` (public)
- `demand-specs` (private)

## Realtime
Enabled for:
- `demands`
- `demand_groups`
- `merchant_offers`
- `orders`
- `notifications`

## Backend Integration
- Supabase client: `backend/app/core/supabase.py`
- Auth dependency: `backend/app/core/security.py`
- Profile service: `backend/app/services/profile_service.py`
- Current user endpoint: `GET /api/v1/users/me`

## Frontend Integration
Reusable service modules:
- `frontend/src/services/supabase.ts`
- `frontend/src/services/authService.ts`
- `frontend/src/services/productService.ts`
- `frontend/src/services/demandService.ts`

Existing UI pages are preserved; mock data remains until each module is migrated to live queries.

## Email Configuration (Supabase Auth)

To avoid the default Supabase email rate limit, configure a custom SMTP provider in the Supabase Dashboard:

1. Go to **Authentication -> SMTP Settings** in your Supabase project.
2. Enable **Custom SMTP**.
3. Enter your SMTP host, port, username, password, and sender email.
4. Save and test email delivery.

Store SMTP credentials only in Supabase Dashboard or backend environment variables. Never expose them in frontend code.
