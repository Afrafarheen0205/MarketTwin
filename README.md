# MarketTwin – A Demand-Driven Marketplace

MarketTwin is a demand-driven marketplace where buyers aggregate purchasing intent and merchants submit competitive offers. Customers can search for products; if an item is unavailable, they submit demands. The platform identifies similar demands, groups compatible buyers, and invites verified merchants to submit competitive fulfillment proposals. Customers purchase only after explicitly reviewing and approving the winning offer.

## System Architecture & Roles

1. **Customer**
   - Searches catalog and creates product demands.
   - Joins demand groups to unlock bulk pricing.
   - Compares merchant offers and approves purchases explicitly.

2. **Merchant**
   - Views grouped demand pools.
   - Submits competitive offers.
   - Fulfills approved orders.

3. **Admin**
   - Platform governance, category management, demand oversight.
   - Merchant accreditation and dispute resolution.
   - Analytics across demands, offers, and transactions.

## Technology Stack

### Frontend
- React 18 + TypeScript
- Vite 6
- Tailwind CSS 3
- React Router 6
- Axios
- Ant Design 5
- Supabase JS client

### Backend
- Python 3.10+
- FastAPI
- Pydantic v2
- Uvicorn
- Supabase Python client
- Groq SDK (optional AI features)

### Database & Cloud
- Supabase PostgreSQL
- Supabase Authentication
- Supabase Storage
- Supabase Realtime

## Repository Structure

```
markettwin/
├── README.md
├── docs/
│   └── DATABASE.md
├── backend/
│   ├── .env.example
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py
│   │   ├── api/v1/
│   │   ├── core/
│   │   ├── schemas/
│   │   └── services/
│   ├── sql/migrations/
│   └── tests/
└── frontend/
    ├── .env.example
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── api/
        ├── components/
        ├── context/
        ├── pages/
        ├── services/
        └── router/
```

## Getting Started

### Prerequisites
- Node.js v18+ (v20+ recommended)
- npm v9+
- Python 3.10+
- Git

### Backend Setup

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
copy .env.example .env          # Windows
# cp .env.example .env          # macOS/Linux
```

Edit `backend/.env` with your Supabase credentials:

```env
PROJECT_NAME="MarketTwin API"
ENVIRONMENT="development"
DEBUG=True
API_V1_STR="/api/v1"
ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"

SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SUPABASE_JWT_SECRET="your-jwt-secret"
FRONTEND_URL="http://localhost:5173"

ADMIN_EMAIL="admin@markettwin.com"
ADMIN_PASSWORD="your-secure-admin-password"

GROQ_API_KEY="your-groq-api-key"

AI_PROVIDER="ollama"
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="qwen3.5:4b"

PAYPAL_CLIENT_ID="your-paypal-client-id"
PAYPAL_CLIENT_SECRET="your-paypal-client-secret"
PAYPAL_MODE="sandbox"
```

For local AI conversations, run Ollama on the same machine as the backend and pull
the configured model (`ollama pull qwen3.5:4b`). The backend
calls Ollama at the configured base URL; do not expose Ollama's port publicly.
The anonymous conversation endpoint is `POST /api/v1/ai/conversation`. It does
not save conversations or create demands. A hosted backend such as Render cannot
reach your computer through its own `localhost`; production inference needs a
provider reachable from that backend.

Run migrations:

```bash
python -c "import psycopg2; print('ok')"
# Apply SQL files in backend/sql/migrations in order
```

Start backend:

```bash
uvicorn app.main:app --reload --port 8000
```

Backend URLs:
- Base: http://localhost:8000
- Health: http://localhost:8000/api/v1/health
- Docs: http://localhost:8000/docs

### Frontend Setup

```bash
cd frontend
npm install
copy .env.example .env          # Windows
# cp .env.example .env          # macOS/Linux
```

Edit `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Start frontend:

```bash
npm run dev
```

Frontend URL: http://localhost:5173

Production build:

```bash
npm run build
```

## Database Setup

SQL migrations are located in `backend/sql/migrations`. Apply them in order to your Supabase PostgreSQL database.

See `docs/DATABASE.md` for:
- Table relationships
- RLS policies
- Storage buckets
- Realtime configuration
- Environment setup

Migration `015_phase3_atomic_demand_submission.sql` adds the Phase 3 price-range,
fractional-quantity, ownership-policy, and atomic demand create/update contracts.
Review and verify it against a staging database before applying it to production.
Demand submission, editing, and analysis remain disabled by default through
`DEMAND_PERSISTENCE_ENABLED` and `DEMAND_ANALYSIS_ENABLED`; enable them only after
the migration and controlled staging checks succeed.

## Authentication

- Supabase Auth handles registration, login, password reset, and sessions.
- Frontend uses only the anon key.
- Backend verifies JWTs and enforces roles.
- Admin accounts are provisioned securely through backend-controlled processes.
- Role-based route protection is enforced in frontend and backend.

## Core Features

- Product catalogue and search
- Customer demand creation
- Demand requirement extraction and normalization
- Similar demand grouping
- Merchant bidding and offer submission
- Offer validation and customer selection
- Order creation and PayPal payment foundation
- Order fulfillment and delivery tracking
- Admin governance and analytics

## Security

- No hardcoded secrets in frontend.
- Service-role key is backend-only.
- RLS enabled on application tables.
- Backend validates all protected operations.
- PayPal credentials are server-side only.

## Testing

### Backend

```bash
cd backend
.\.venv\Scripts\python.exe -m pytest -v
```

### Frontend

```bash
cd frontend
npm run build
```

## Deployment Notes

- Use production Supabase project and apply all migrations.
- Configure environment variables for production.
- Enable Supabase SMTP for email delivery.
- Use PayPal sandbox for testing before live credentials.
- Deploy frontend as SPA with routing fallback.
- Deploy backend with Uvicorn/Gunicorn behind HTTPS.
- Verify health checks, RLS, and payment flows before launch.

## License

This project is provided for development and educational use. Add your preferred license as needed.