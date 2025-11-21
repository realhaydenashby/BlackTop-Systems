# ClarityOS - Financial Intelligence Platform

## Overview

ClarityOS is an AI-powered financial diagnostic and action platform designed for SMBs and startups. It serves as a pre-accounting/pre-FP&A financial intelligence layer that ingests messy financial inputs (statements, invoices, receipts, subscription emails, payroll summaries, CSVs), extracts and normalizes data, diagnoses financial behavior, and generates budgets and monthly action plans.

The application is a B2B SaaS platform targeting founders, operations managers, and fractional CFOs who need financial intelligence without requiring a dedicated CFO.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite for fast development and optimized production builds
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack Query (React Query) for server state
- **UI Framework**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design system

**Design System:**
- Dark-themed professional financial SaaS interface
- Color palette centered around dark navy (#050816), deep blue (#1D4ED8), and teal/cyan (#22D3EE) accents
- Typography using Inter font family
- Component library based on Shadcn/ui with customized variants
- Responsive desktop-first design with left sidebar navigation

**Key Frontend Patterns:**
- Protected routes with authentication guards
- Centralized API communication through query client
- Form validation using react-hook-form with Zod schemas
- File uploads handled via Uppy with AWS S3 integration
- Chart visualizations using Recharts library

### Backend Architecture

**Technology Stack:**
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for HTTP server
- **Database ORM**: Drizzle ORM with Neon serverless PostgreSQL
- **Authentication**: Replit Auth (OIDC-based) with Passport.js strategy
- **Session Management**: Express sessions stored in PostgreSQL
- **AI Integration**: OpenAI API (GPT-5) via Replit AI Integrations service

**Server Structure:**
- Separate entry points for development (with Vite middleware) and production
- Request logging middleware with timestamp formatting
- RESTful API routes organized by resource
- Service layer pattern for business logic (storage abstraction)

**AI Processing Pipeline:**
1. Document upload and storage in Google Cloud Storage
2. Text extraction from PDFs and CSVs using pdf-parse and PapaParse
3. Batch processing of AI prompts with rate limiting and retry logic
4. Transaction extraction, insight generation, budget suggestions, and action plan creation
5. Structured data storage for all AI-generated outputs

**Multi-tenancy:**
- Organization-based tenant isolation
- User roles: founder, ops, accountant, cfo
- Organization members linked via junction table
- All financial data scoped to organization context

### Data Storage

**Database Schema (PostgreSQL via Neon):**

**Core Entities:**
- `users` - User profiles with Replit Auth integration
- `organizations` - Tenant entities with industry, size, and configuration
- `organization_members` - User-organization relationships with roles
- `sessions` - Express session storage for authentication

**Financial Data:**
- `documents` - Uploaded financial documents (PDFs, CSVs, images) with cloud storage URLs
- `transactions` - Normalized transaction records extracted from documents
- `vendors` - Vendor/supplier master data
- `categories` - Spending categories for classification
- `departments` - Organizational departments for allocation

**Intelligence Layer:**
- `insights` - AI-generated financial insights with severity levels
- `budgets` - Budget periods with overall targets
- `budget_lines` - Category-level budget allocations
- `action_plans` - Monthly action plans with priority levels
- `action_items` - Specific tasks within action plans

**Integrations:**
- `integration_connections` - Third-party service connections (Stripe, Plaid, QuickBooks)

**Data Relationships:**
- All financial entities are scoped to organizations
- Transactions linked to documents, vendors, categories, and departments
- Budget lines reference categories and departments
- Action items linked to action plans and insights

### External Dependencies

**Cloud Services:**
- **Google Cloud Storage**: Document and file storage via Replit sidecar endpoint
- **Neon Database**: Serverless PostgreSQL for all application data
- **Replit AI Integrations**: OpenAI API access for GPT-5 model

**Third-Party Integrations (Planned):**
- **Stripe**: Payment and subscription data synchronization
- **Plaid**: Bank account transaction feeds
- **QuickBooks**: Accounting software export capabilities

**Authentication:**
- **Replit Auth**: OIDC-based authentication service
- Session management with PostgreSQL-backed store
- Secure cookie-based authentication flow

**AI Processing:**
- Concurrent request limiting (2 simultaneous requests)
- Exponential backoff retry strategy for rate limits
- Structured prompt engineering for transaction extraction, insight generation, budgeting, and action planning
- Token limits: 8192 max completion tokens per request

**Client Libraries:**
- Uppy for file upload UI and S3 integration
- Recharts for data visualization
- date-fns for date manipulation
- PapaParse for CSV parsing
- pdf-parse for PDF text extraction
- Stripe SDK for payment integrations