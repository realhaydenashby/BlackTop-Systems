# BlackTop Systems - Financial Diagnostic Engine

## Overview
BlackTop Systems is a financial diagnostic engine designed for startups and SMBs, acting as a "financial co-pilot." It automates the process of connecting to various financial data sources, ingesting and normalizing data using AI, computing core analytics (like burn rate and runway), and generating actionable insights. The platform aims to provide founders with crucial financial understanding without the need for a dedicated CFO, focusing on identifying key financial trends and potential issues.

## User Preferences
- Communication style: Simple, everyday language
- Design: Dark, minimal, professional grayscale theme
- Focus: Founder-friendly, no FP&A jargon

## System Architecture

### Financial Diagnostic Pipeline
The core pipeline involves: Integrations → Ingestion → Normalize (AI-based) → Analytics → Insights → Notifications.

### Two-Mode Architecture
The application operates in distinct Demo and Live modes.
- **Demo Mode:** Accessible without authentication, uses static mock data, and serves as a full-featured evaluation platform.
- **Live Mode:** Requires authentication, uses real API calls, and provides access to actual financial data and features. Navigation is connection-aware, meaning certain features (Analytics, Fundraising Prep) only appear when an active financial data source is connected.

### Key Features
- **Analytics Engine:** Calculates burn rate, runway, cash flow, and 12-month forward forecasts.
- **Insights Engine:** Generates 3-5 actionable insights per sync, including runway warnings, vendor spend spikes, and recurring subscription creep.
- **Transaction Normalization:** AI-powered vendor name normalization, automatic category classification, and recurring transaction detection.
- **Scenario Modeling Workbook:** A spreadsheet-style interface for 12-month financial projections, allowing for scenario comparison (Conservative/Base/Aggressive) with editable parameters and dynamic calculations.
- **AI Copilot with Tool-Calling:** Utilizes OpenAI function calling for interactive scenario modeling, with tools for adding hires, expenses, running what-if scenarios, and analyzing spend.
- **Shareable Reports:** Generates investor-ready HTML reports with key financial metrics accessible via UUID-based public links.
- **Notification System:** Multi-channel alerts (email, Slack, SMS) for proactive monitoring, including threshold warnings and weekly digests.
- **Waitlist & Access Control:** Implements a controlled waitlist for early access, with an admin panel for approval management and backend access gating based on user approval status.
- **AI Investor Updates (Growth tier):** AI-generated monthly investor updates with editable sections for highlights, challenges, metrics narrative, outlook, and asks. Includes structured card view and full text export with persistence layer to save edits.
- **Automated Board Packets (Growth tier):** Comprehensive board meeting preparation documents with executive summary, financial overview, key metrics dashboard, headcount analysis, risks/mitigations, and strategic updates. Supports scheduled generation and HTML export.

### Production Hardening
- **Error Handling:** Comprehensive system with error codes, HTTP status mapping, and user-friendly messages for various integration and internal errors.
- **Audit Logging:** Tracks user actions for compliance, capturing details on financial data interactions, integrations, and report generation.
- **AI Service Resilience:** Includes retry logic with exponential backoff, provider fallback (OpenAI → Groq → Gemini), and rule-based fallbacks for AI failures, alongside confidence scores for AI-generated data.

### AI Enhancement Architecture (Multi-Model Ensemble)
The platform uses an **algorithm-first, AI-augmented** approach where deterministic calculations execute first, then AI interprets results.

#### Core Analytics Services (`server/analytics/`)
- **FinancialMetricsEngine** (`metricsEngine.ts`): Deterministic financial calculations for burn rate, runway, margins, cash flow, growth rates. Computes trend analysis, moving averages, and exponential smoothing.
- **AnomalyDetector** (`anomalyDetector.ts`): Statistical anomaly detection using z-scores, IQR (interquartile range), moving average deviations, and seasonal decomposition. Detects unusual spending patterns, vendor anomalies, and category spikes.
- **ForecastEngine** (`forecastEngine.ts`): Monte Carlo simulations (1000 runs default) for probabilistic forecasting. Generates confidence intervals (p10/p50/p90), runway distributions, and sensitivity analysis.
- **OrganizationFeatureStore** (`featureStore.ts`): Company-specific pattern learning. Tracks spending trends, vendor behavior profiles, recurring transaction patterns, and seasonal indices over time.

#### Multi-Model AI Orchestration (`server/ai/`)
- **AIOrchestrator** (`orchestrator.ts`): Multi-model ensemble with circuit breakers, health monitoring, and automatic failover. Supports OpenAI, Groq, and Gemini with consensus voting for critical decisions. Includes provider weight scoring based on success rate and latency.
- **HybridAIPipeline** (`hybridPipeline.ts`): Combines algorithm outputs with AI interpretation. Algorithm insights are generated first, then AI adds complementary insights. Includes output validation to ensure AI responses address key metrics.

#### AI Enhancement Database Tables (8 new tables)
- `metric_snapshots`: Computed metrics stored periodically with confidence scores
- `org_feature_history`: Time-series features for pattern learning (trends, rolling stats, seasonal indices)
- `vendor_behavior_profiles`: Vendor-specific patterns (billing frequency, price changes, volatility)
- `anomaly_baselines`: Statistical baselines per metric (mean, stdDev, IQR, thresholds)
- `anomaly_events`: Detected anomalies with severity, status, and context
- `scenario_runs`: Advanced scenario modeling with Monte Carlo results
- `ai_audit_logs`: Full audit trail of AI decisions (provider, model, confidence, validation)
- `ai_context_notes`: Human feedback for AI learning (corrections, approvals, rejections)
- `ai_model_performance`: Track model performance over time (latency, error rate, consensus rate)

### Plan-Based Feature Gating
A three-tier pricing model (Lite, Core, Growth) gates features on both the frontend (using `usePlanAccess` hook and `FeatureGate` components) and backend (using `requireFeature` middleware) to control access to advanced functionalities like the AI Copilot, scenario modeling, and shareable reports.

## External Dependencies

### Frontend
- React 18+
- Vite
- Wouter
- TanStack Query
- Shadcn/ui + Radix primitives
- Tailwind CSS

### Backend
- Node.js + Express
- Drizzle ORM
- Neon PostgreSQL
- Replit Auth (OIDC)
- AI: Groq, Gemini

### Integrations
- Plaid (bank connections)
- Yodlee FastLink (bank connections, fallback)
- QuickBooks (accounting software - OAuth 2.0)
- Xero (accounting software - OAuth 2.0)
- Stripe (revenue data)
- Slack (notifications)
- Twilio (SMS notifications)