# BlackTop Systems - Financial Diagnostic Engine

## Overview

BlackTop Systems is a financial diagnostic engine for startups and SMBs. It follows a simple pipeline: **Connect → Ingest → Normalize → Analyze → Insights → Alert**.

The platform ingests financial data from multiple sources (bank accounts, accounting software, payment processors), normalizes it using AI, computes core analytics, and generates actionable insights. It's designed to be the "financial co-pilot" that tells founders what's happening with their money without requiring a dedicated CFO.

## Core Architecture

### Financial Diagnostic Pipeline

```
Integrations → Ingestion → Normalize → Analytics → Insights → Notifs
     ↓            ↓           ↓            ↓           ↓         ↓
  Yodlee       Unified      AI-based     Burn/       3-5      Slack
  Plaid       Transaction  Vendor +     Runway     Actions   SMS
  QB           Store       Category     Forecast            Email
  Stripe
  CSV
```

### Server Structure

```
/server
  /integrations       # Financial data source adapters
    /yodlee           # Bank account connections
    /plaid            # Alternative bank connection
    /qb               # QuickBooks integration
    /stripe           # Revenue data
    facade.ts         # Unified interface
    registry.ts       # Provider management
    types.ts          # Shared types

  /ingestion          # Raw transaction processing
    ingest.ts         # Unified ingestion with deduplication
    csv.ts            # CSV import
    types.ts          # UnifiedTransaction type

  /normalize          # AI-powered normalization
    /providers        # Groq, Gemini adapters
    vendor.ts         # Vendor name normalization
    category.ts       # Category classification
    recurring.ts      # Recurring detection

  /analytics          # Core financial calculations
    burn.ts           # calculateBurnRate()
    runway.ts         # calculateRunway()
    cashflow.ts       # calculateCashFlow()
    forecast.ts       # generateForecast()
    types.ts          # Metric types

  /insights           # Actionable intelligence
    generator.ts      # Generate 3-5 insights
    anomalies.ts      # Vendor spikes, burn acceleration
    types.ts          # Insight types

  /notifs             # Alert delivery
    slack.ts          # Slack webhooks
    sms.ts            # SMS (Twilio)
    index.ts          # Rate limiting, quiet hours
```

### Client Structure

```
/client/src/pages
  /app                # Live Mode (real data)
    dashboard.tsx     # Main dashboard with dropdown sections
    transactions.tsx  # Spreadsheet-style transaction list
    bank-connect.tsx  # Yodlee FastLink connection
    settings.tsx      # User preferences and notifications

  # Demo Mode pages still exist at root level
  dashboard.tsx       # Demo dashboard
  transactions.tsx    # Demo transactions
  ...
```

## Two-Mode Architecture

The app uses strict route-based separation between Demo and Live modes.

### Demo Mode (Base Routes - No Auth Required)
Routes: `/dashboard`, `/transactions`, `/upload`, `/analytics`, `/fundraising`, `/settings`, `/documents`, `/cash-flow`, `/budgets`, `/action-plans`, `/resources`, `/integrations`
- Accessible without authentication (uses DemoRouter)
- Uses `demoDataService.ts` for static mock data
- TopBar shows "Demo workspace" badge
- Full-featured demo for evaluation before connecting real accounts

### Live Mode (/app/* - Auth Required)
Routes: `/app`, `/app/transactions`, `/app/upload`, `/app/settings`, `/app/connect`, `/app/analytics`, `/app/fundraising`, `/app/forecasting/workbook`
- Protected routes requiring Replit Auth (uses ProtectedRoute)
- Uses real API calls via `liveDataService.ts`
- TopBar shows "Live workspace" badge
- **Dashboard**: Single page with collapsible sections (Spend, Revenue, Burn, Runway, Forecast, Raise, Hiring)
- **Transactions**: Spreadsheet-style view with search, filter, categorization
- **Connect**: Bank account connection via Plaid (primary) or Yodlee FastLink (fallback)
- **Analytics**: Connection-aware analytics (Spend, Revenue, Profitability, Forecasting tabs) - only shown in sidebar when user has active connections
- **Fundraising**: Connection-aware fundraising prep (Burn, Runway, Raise, Hiring tabs) - only shown in sidebar when user has active connections
- **Forecasting Workbook**: Spreadsheet-style scenario modeling with 12-month projections
- **Settings**: Notifications, company info, integrations

### Connection-Aware Navigation
The LiveSidebar uses `useConnectionStatus` hook to check for active financial connections:
- **Endpoint**: `GET /api/live/connections/status` - Returns `{ hasActiveConnection: boolean, connections: [...] }`
- **Checks**: Plaid items, Yodlee bank accounts, QuickBooks connections
- **Behavior**: Analytics and Fundraising Prep menu sections only appear when user has at least one active financial data source

### Mode Switching
- Landing page: "Request Early Access" → `/waitlist`, "Explore Demo" → `/dashboard`
- TopBar: Mode switcher dropdown navigates between equivalent demo/live routes
- AppModeContext: Syncs mode from URL on load and popstate events

## Waitlist & Access Control

### Launch Strategy
BlackTop uses a controlled waitlist approach to manage early access:
- Users request access via `/waitlist` signup form
- Admins review and approve/reject signups via `/admin/waitlist`
- Approved users can access Live Mode; unapproved users see pending page

### Waitlist Routes
- `/waitlist` - Public signup form (name, email, role, company, pain point)
- `/waitlist/success` - Thank you page after signup
- `/waitlist/pending` - Shown to authenticated but unapproved users
- `/admin/waitlist` - Admin panel for managing signups (requires isAdmin)

### Access Control Flow
1. User signs up via Replit Auth → redirected to `/app`
2. ProtectedRoute checks `/api/auth/approval-status`
3. If `isApproved` or `isAdmin` → show Live Mode
4. If not approved → show WaitlistPending page

### Database Schema
- `waitlist` table: email, name, role, company, painPoint, status (pending/approved/rejected)
- `users` table: `isApproved` (boolean), `isAdmin` (boolean) fields added

### API Endpoints
- `POST /api/waitlist` - Public signup (no auth)
- `GET /api/auth/approval-status` - Check user approval status
- `GET /api/admin/waitlist` - List all waitlist entries (admin only)
- `POST /api/admin/waitlist/:id/approve` - Approve user (admin only)
- `POST /api/admin/waitlist/:id/reject` - Reject user (admin only)
- `GET /api/admin/waitlist/export` - Export CSV (admin only)

### Data Services
- `client/src/services/demoDataService.ts`: Comprehensive mock data for all demo pages:
  - **Analytics**: spendTrend, categoryDistribution, topVendors, revenue (MRR/ARR), profitability (margins), forecasting (historical + projections)
  - **Fundraising**: burn ($85K/mo), runway (18 months), raise ($2.2M recommended), hiring (12 headcount + 5 planned)
  - All action plans with severity levels and recommendations
- `client/src/services/liveDataService.ts`: Real API calls for authenticated Live Mode
- `client/src/services/notificationsService.ts`: Stub for Slack/SMS alerts (console logging)
- `server/mockData.ts`: Server-side mock data generator used when no real data exists

## Key Features

### Analytics Engine
- **Burn Rate**: Gross burn, net burn, payroll vs non-payroll breakdown
- **Runway**: Current cash / monthly burn with planned hire adjustments
- **Cash Flow**: Inflows, outflows, net flow by period
- **Forecast**: 12-month forward projection based on historical trends

### Insights Engine
Generates 3-5 actionable insights per sync:
- Runway warnings ("6.2 months remaining")
- Vendor spikes ("AWS up 42% this month")
- Subscription creep ("Recurring SaaS is $3,450/mo")
- Payroll drift ("Payroll exceeded plan by 9%")
- Anomaly detection (unusual transactions)

### Transaction Normalization
- AI-powered vendor name normalization
- Automatic category classification with confidence scores
- Recurring transaction detection
- Payroll identification

### Scenario Modeling Workbook
Located at `/app/forecasting/workbook`:
- Spreadsheet-style interface with 3 historical + 9 projected months
- Editable cells for projections (Revenue, COGS, OpEx categories)
- Auto-calculating derived fields (Gross Margin, Net Cash, Runway)
- Summary cards showing aggregated metrics
- Reset and export functionality
- Client-side state management with `useState` and `useCallback`
- **Scenario Comparison**: Side-by-side view of Conservative/Base/Aggressive scenarios
  - Editable parameters: revenue growth, burn growth, new hires, avg salary
  - Dynamic runway/burn calculations with visual change indicators
  - Collapsible section integrated below the financial model table

### AI Copilot with Tool-Calling
Located in `/server/copilot/tools.ts`:
- Uses OpenAI function calling for interactive scenario modeling
- **Available Tools**:
  - `add_planned_hire`: Add planned hire and recalculate runway
  - `add_recurring_expense`: Add recurring expense (SaaS, marketing, etc.)
  - `calculate_scenario`: Run what-if scenario with revenue/expense changes
  - `get_vendor_analysis`: Analyze spend by vendor with month-over-month changes
  - `get_category_breakdown`: Breakdown of spend by category
  - `fundraising_calculator`: Calculate optimal raise amount and timing
- Users can ask: "What if I hire a $90k engineer?" and get real scenario results

### Shareable Reports
Located in `/server/reports/shareableReport.ts`:
- Generate investor-ready HTML reports with runway, burn, and key metrics
- UUID-based public links (immutable snapshots)
- Endpoints:
  - `POST /api/reports/shareable` - Create new report
  - `GET /api/reports/shareable` - List all reports
  - `GET /api/reports/:id` - View public HTML report
  - `DELETE /api/reports/shareable/:id` - Delete report
- Report includes: cash position, burn rate, runway, trend indicators, top categories

### Notification System
Multi-channel alerts for proactive monitoring:
- **Weekly Email Digest**: Runway, burn change, top 3 insights
- **Threshold Alerts**: 
  - Runway < 6 months warning
  - Vendor spike > 20% detection
  - Burn acceleration alerts
- Channels: Slack webhooks, Email (SMTP), SMS (Twilio)
- Configuration in `/server/notifs/`

## Data Model

### Core Entities
- `users` - Replit Auth profiles
- `organizations` - Tenant entities
- `bank_accounts` - Connected accounts (Plaid/Yodlee)
- `plaid_items` - Plaid access tokens and cursors for incremental sync
- `transactions` - Unified transaction records with:
  - `externalId` - Provider's transaction ID
  - `plaidTransactionId` - Plaid's transaction ID for deduplication
  - `source` - plaid | yodlee | csv | stripe | manual
  - `vendorOriginal` - Raw vendor string
  - `vendorNormalized` - AI-cleaned vendor name
  - `classificationConfidence` - AI confidence 0-1
  - `isRecurring` - Recurring detection flag

### Analytics Storage
- `burn_metrics` - Calculated monthly metrics
- `insights` - Generated insights with confidence scores
- `planned_hires` - Future headcount for runway calc
- `raise_recommendations` - AI fundraising advice
- `audit_logs` - Compliance tracking for user actions (views, exports, changes)

## Production Hardening

### Error Handling (`server/errors.ts`)
Comprehensive error handling system with:
- **Error Codes**: Covering all integration types (Plaid, QuickBooks, Yodlee, Stripe, AI, storage, encryption)
- **HTTP Status Mapping**: Proper semantics (401 auth, 402 payment, 403 forbidden, 404 not found, 422 unprocessable, 424 dependency failed, 429 rate limit, 502 upstream failure, 503 unavailable)
- **User-Friendly Messages**: Actionable guidance for non-technical founders
- **Usage**: `createError("PLAID_SYNC_FAILED", { itemId })` returns typed error with proper status

### Audit Logging (`server/auditLogService.ts`)
Financial data compliance tracking:
- **Actions**: auth.login/logout, data.view/export/modify/delete, transaction.update/categorize, integration.connect/disconnect/sync, report.generate/share
- **Resource Types**: transaction, bank_account, plaid_item, quickbooks_token, organization, user, report, insight, settings
- **Capture**: userId, organizationId, action, resourceType, resourceId, details, ipAddress, userAgent
- **Usage**: `auditLogService.logIntegrationEvent(userId, orgId, "plaid_item", itemId, "connect", req)`

### AI Service Resilience (`server/aiService.ts`)
- **Retry Logic**: 3 attempts with exponential backoff (1s, 2s, 4s)
- **Provider Fallback**: OpenAI → Groq → Gemini
- **Rule-Based Fallback**: Deterministic vendor/category classification when AI fails
- **Confidence Scores**: 0-1 scale on all AI-generated insights

## Technology Stack

### Frontend
- React 18+ with TypeScript
- Vite build tool
- Wouter routing
- TanStack Query for data fetching
- Shadcn/ui + Radix primitives
- Tailwind CSS

### Backend
- Node.js + Express + TypeScript
- Drizzle ORM with Neon PostgreSQL
- Replit Auth (OIDC)
- AI: Groq/Gemini for normalization

### Integrations
- Plaid for bank connections (primary)
- Yodlee FastLink for bank connections (fallback)
- Stripe for revenue data
- Slack/SMS for notifications

## User Preferences

- Communication style: Simple, everyday language
- Design: Dark, minimal, professional grayscale theme
- Focus: Founder-friendly, no FP&A jargon
