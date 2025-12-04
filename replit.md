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

### Production Hardening
- **Error Handling:** Comprehensive system with error codes, HTTP status mapping, and user-friendly messages for various integration and internal errors.
- **Audit Logging:** Tracks user actions for compliance, capturing details on financial data interactions, integrations, and report generation.
- **AI Service Resilience:** Includes retry logic with exponential backoff, provider fallback (OpenAI → Groq → Gemini), and rule-based fallbacks for AI failures, alongside confidence scores for AI-generated data.

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
- Stripe (revenue data)
- Slack (notifications)
- Twilio (SMS notifications)