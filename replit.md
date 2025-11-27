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
Routes: `/app`, `/app/transactions`, `/app/upload`, `/app/settings`, `/app/connect`
- Protected routes requiring Replit Auth (uses ProtectedRoute)
- Uses real API calls via `liveDataService.ts`
- TopBar shows "Live workspace" badge
- **Dashboard**: Single page with collapsible sections (Spend, Revenue, Burn, Runway, Forecast, Raise, Hiring)
- **Transactions**: Spreadsheet-style view with search, filter, categorization
- **Connect**: Bank account connection via Yodlee FastLink
- **Settings**: Notifications, company info, integrations

### Mode Switching
- Landing page: "Explore Demo" → `/dashboard`, "Log in" → auth flow → `/app`
- TopBar: Mode switcher dropdown navigates between equivalent demo/live routes
- AppModeContext: Syncs mode from URL on load and popstate events

### Data Services
- `client/src/services/demoDataService.ts`: Centralized mock data (transactions, spend, burn, runway, vendors)
- `client/src/services/liveDataService.ts`: Placeholder functions for real API calls
- `client/src/services/notificationsService.ts`: Stub for Slack/SMS alerts (console logging)

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

## Data Model

### Core Entities
- `users` - Replit Auth profiles
- `organizations` - Tenant entities
- `bank_accounts` - Connected accounts (Yodlee)
- `transactions` - Unified transaction records with:
  - `externalId` - Provider's transaction ID
  - `source` - yodlee | csv | stripe | manual
  - `vendorOriginal` - Raw vendor string
  - `vendorNormalized` - AI-cleaned vendor name
  - `classificationConfidence` - AI confidence 0-1
  - `isRecurring` - Recurring detection flag

### Analytics Storage
- `burn_metrics` - Calculated monthly metrics
- `insights` - Generated insights
- `planned_hires` - Future headcount for runway calc
- `raise_recommendations` - AI fundraising advice

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
- Yodlee FastLink for bank connections
- Stripe for revenue data
- Slack/SMS for notifications

## User Preferences

- Communication style: Simple, everyday language
- Design: Dark, minimal, professional grayscale theme
- Focus: Founder-friendly, no FP&A jargon
