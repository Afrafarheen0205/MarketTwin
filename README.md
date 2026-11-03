# MarketTwin – A Demand-Driven Marketplace

MarketTwin is a demand-driven marketplace architecture where buyers aggregate purchasing intent and merchants submit competitive offers. Customers can search for existing products; if an item is unavailable, they submit demands. The platform automatically identifies similar demands, groups buyers with compatible requirements, and invites verified merchants to submit competitive fulfillment proposals. Customers purchase only after explicitly reviewing and approving the winning offer.

---

## 🏛️ System Architecture & Roles

MarketTwin is architected around three distinct user roles:

1. **Customer**:
   - Searches catalog for existing products.
   - Creates custom product demands when items are not listed.
   - Automatically grouped with other customers sharing similar product requirements to unlock bulk merchant pricing.
   - Compares eligible offers and purchases **only after explicit approval** of the final merchant offer.

2. **Merchant**:
   - Accesses grouped customer demand pools.
   - Submits competitive pricing, quantity discounts, and fulfillment terms.
   - Fulfills demand orders upon customer group approval.

3. **Admin**:
   - Platform governance, category management, and demand quality oversight.
   - Merchant accreditation and dispute resolution.
   - Analytics monitoring across demands, offers, and transaction pipelines.

---

## 💻 Technology Stack

### Frontend
- **React.js 18** + **TypeScript**
- **Ant Design (AntD) 5.x** (enterprise-grade UI library in professional Light Theme)
- **@ant-design/icons** (consistent iconography)
- **Vite 6** (lightning-fast bundler and HMR)
- **Tailwind CSS 3** (configured for Light Theme palette: #FFFFFF, #F5F7FA, #172B4D, #1677FF)
- **React Router 6** (client-side routing)
- **Axios** (configured HTTP client with base URL, request/response interceptors, and error handling)

### Backend
- **Python 3.10+**
- **FastAPI** (high-performance asynchronous REST API framework)
- **Pydantic v2** & **pydantic-settings** (type validation and environment settings management)
- **Uvicorn** (ASGI server)

### Database & Cloud Services
- **Supabase PostgreSQL** (relational data store)
- **Supabase Authentication** (secure user sessions and role claims)
- **Supabase Storage** (product images and demand specifications)
- **Supabase Realtime** (live group updates and offer alerts)

---

## 📁 Repository Structure

```
markettwin/
├── .gitignore                   # Root gitignore protecting secrets & build artifacts
├── README.md                    # Project documentation & developer guide
├── backend/                     # Python FastAPI Backend
│   ├── .env                     # Local environment file (git-ignored)
│   ├── .env.example             # Environment variable template
│   ├── .gitignore               # Backend gitignore
│   ├── requirements.txt         # Python package dependencies
│   ├── app/
│   │   ├── __init__.py          # App version and metadata
│   │   ├── main.py              # FastAPI application factory, CORS, exception handlers
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── v1/
│   │   │       ├── __init__.py
│   │   │       ├── router.py    # Aggregator for v1 route endpoints
│   │   │       └── endpoints/
│   │   │           ├── __init__.py
│   │   │           └── health.py # Health diagnostic endpoints (/health, /api/v1/health)
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── config.py        # Pydantic BaseSettings (.env loading & validation)
│   │   │   ├── exceptions.py    # Domain exceptions & standardized error handlers
│   │   │   └── supabase.py      # Supabase client wrapper & connectivity checker
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── common.py        # Generic API envelopes and UserRole enum
│   │   │   └── health.py        # HealthCheckResponse & ServiceStatus models
│   │   └── services/
│   │       └── __init__.py      # Business logic services (demands, offers, matching)
│   └── tests/
│       ├── __init__.py
│       └── test_health.py       # API & health check test suite
└── frontend/                    # React + TypeScript + Vite Frontend
    ├── .env                     # Frontend environment variables (git-ignored)
    ├── .env.example             # Frontend environment template
    ├── .gitignore               # Frontend gitignore
    ├── index.html               # Main HTML entrypoint
    ├── package.json             # NPM dependencies & scripts
    ├── postcss.config.js        # PostCSS configuration for Tailwind
    ├── tailwind.config.js       # Tailwind CSS theme extension
    ├── tsconfig.json            # TypeScript compiler configuration
    ├── tsconfig.node.json       # Node TypeScript configuration for Vite
    ├── vite.config.ts           # Vite bundler configuration & path aliases
    ├── public/
    │   └── vite.svg
    └── src/
        ├── App.tsx              # Root React component with RouterProvider
        ├── index.css            # Tailwind directives and base layer styles
        ├── main.tsx             # DOM mount entry point
        ├── vite-env.d.ts        # Vite environment types declaration
        ├── api/
        │   ├── axiosClient.ts   # Intercepted Axios instance with base URL & error handler
        │   └── healthApi.ts     # Health check API methods
        ├── components/
        │   ├── common/
        │   │   ├── Navbar.tsx   # Top navigation with live backend connection badge
        │   │   └── Footer.tsx   # App footer
        │   └── layout/
        │       └── RootLayout.tsx # Responsive root shell layout
        ├── config/
        │   ├── env.ts           # Environment variable validation & safe accessors
        │   └── supabaseClient.ts # Supabase client initializer (public anon key only)
        ├── pages/
        │   ├── HomePage.tsx     # Overview dashboard, live health ping tool, role preview
        │   └── NotFoundPage.tsx # 404 fallback page
        ├── router/
        │   └── index.tsx        # React Router browser router configuration
        └── types/
            └── index.ts         # TypeScript interfaces (HealthResponse, Roles, etc.)
```

---

## 🚀 Getting Started

Frontend and backend run completely independently. Follow the steps below to set up and launch both services.

### Prerequisites
- **Node.js**: v18+ (v20+ recommended)
- **npm**: v9+
- **Python**: v3.10+
- **Git**

---

### 1. Backend Setup (FastAPI)

1. Open a terminal and navigate to the `backend` directory:
   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:
   - **Windows (PowerShell)**:
     ```powershell
     python -m venv .venv
     .\.venv\Scripts\Activate.ps1
     ```
   - **macOS / Linux**:
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```

3. Install required backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables:
   Copy `.env.example` to `.env`:
   - **Windows**: `copy .env.example .env`
   - **macOS / Linux**: `cp .env.example .env`

   Edit `.env` if you have active Supabase project credentials:
   ```env
   PROJECT_NAME="MarketTwin API"
   ENVIRONMENT="development"
   DEBUG=True
   API_V1_STR="/api/v1"
   ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"

   SUPABASE_URL="https://your-project-id.supabase.co"
   SUPABASE_KEY="your-anon-or-service-role-key"
   SUPABASE_SERVICE_ROLE_KEY="your-service-role-secret-key"
   ```

5. Start the FastAPI development server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   The backend will be available at:
   - **Base URL**: [http://localhost:8000](http://localhost:8000)
   - **Health Check Endpoint**: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)
   - **Interactive API Documentation (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)
   - **Alternative Documentation (ReDoc)**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

### 2. Frontend Setup (React + Vite)

1. Open a new terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Copy `.env.example` to `.env`:
   - **Windows**: `copy .env.example .env`
   - **macOS / Linux**: `cp .env.example .env`

   Edit `.env` as needed:
   ```env
   VITE_API_BASE_URL=http://localhost:8000
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

4. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The frontend will be available at:
   - **Frontend App**: [http://localhost:5173](http://localhost:5173)

5. (Optional) Build for production:
   ```bash
   npm run build
   ```

---

## 🔒 Security & Environment Architecture

- **Zero Hardcoded Secrets**: Secrets and keys are strictly read from environment variables.
- **Frontend vs Backend Key Isolation**:
  - The frontend **only** receives `VITE_SUPABASE_ANON_KEY`, intended for public browser consumption behind Row-Level Security (RLS).
  - The privileged `SUPABASE_SERVICE_ROLE_KEY` is exclusively kept on the backend.
- **CORS Configuration**: FastAPI is restricted by default to allowed frontend origins (`http://localhost:5173`).
- **Standardized Error Handling**: FastAPI uses global exception interceptors that return uniform JSON payloads without leaking internal server stack traces to clients.

---

## 🔍 Verifying Phase 1

1. **Backend Health Check**:
   ```bash
   curl http://localhost:8000/api/v1/health
   ```
   Expected response:
   ```json
   {
     "status": "ok",
     "timestamp": "2026-11-03T13:04:09.445227+00:00",
     "service": "MarketTwin API",
     "version": "0.1.0",
     "environment": "development",
     "services": {
       "database": {
         "status": "unconfigured",
         "message": "Supabase URL and API keys are placeholder/unconfigured.",
         "latency_ms": null
       }
     }
   }
   ```

2. **Frontend UI**:
   - Open [http://localhost:5173](http://localhost:5173).
   - The top navigation bar indicates live backend connection status (**Connected** / **Disconnected**).
   - Click the interactive **Ping API** button to test the live Axios communication with FastAPI.
   - Inspect the three configured user roles (**Customer**, **Merchant**, **Admin**).

---

## 🗺️ Project Development Roadmap

- [x] **Phase 1: Project Foundation & Architecture** (Current)
  - Monorepo folder layout & configuration
  - React + TypeScript + Vite + Tailwind CSS frontend
  - Python FastAPI + Pydantic backend with modular structure
  - Axios API communication client & health-check endpoint
  - Supabase client integration setup with key isolation
  - Error boundaries, type definitions, and documentation
- [ ] **Phase 2: Authentication & Role-Based Access Control (RBAC)**
  - Supabase Auth integration for Customer, Merchant, Admin
  - Protected routes and session management
- [ ] **Phase 3: Product Catalog & Demand Creation**
  - Searchable existing products catalog
  - Customer demand submission form with specifications
- [ ] **Phase 4: Demand Grouping & Aggregation Engine**
  - Clustering similar customer demands
  - Threshold triggers for merchant notifications
- [ ] **Phase 5: Merchant Offers & Competitive Bidding**
  - Merchant dashboard for viewing grouped demands
  - Offer submission with tiered pricing and fulfillment timelines
- [ ] **Phase 6: Customer Offer Comparison & Explicit Approval**
  - Offer comparison matrix
  - Customer approval gating and order finalization
- [ ] **Phase 7: Realtime Notifications & Deployment**
  - Supabase Realtime alerts for offers and group milestones
  - CI/CD pipeline and production deployment
