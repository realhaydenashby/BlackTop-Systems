# ClarityOS Design Guidelines

## Design Approach
**Reference-Based**: Drawing inspiration from modern financial SaaS platforms like Stripe Dashboard, Linear (for clean data presentation), and Notion (for workspace organization), creating a professional, intelligence-focused financial platform.

## Color Palette (User-Specified)
- **Primary Background**: Very dark navy `#050816`
- **Primary Accent**: Deep blue `#1D4ED8`
- **Secondary Accent**: Teal/cyan `#22D3EE` for highlights and interactive elements
- **Surface Backgrounds**: Dark gray `#0F172A` and `#111827` for cards and panels
- **Text Primary**: Off-white `#F9FAFB` for headings and primary content
- **Text Secondary**: Medium gray `#9CA3AF` for supporting text and labels
- **Chart Colors**: Coordinated blue/teal/amber palette with high contrast
- **Success**: Emerald `#10B981`
- **Warning**: Amber `#F59E0B`
- **Critical**: Red `#EF4444`

## Typography
- **Font Family**: Inter or SF Pro Display (sans-serif, highly legible)
- **Headings**: Bold (600-700 weight), slightly condensed spacing
  - H1: 2.5rem (40px), bold
  - H2: 2rem (32px), bold
  - H3: 1.5rem (24px), semibold
  - H4: 1.25rem (20px), semibold
- **Body**: Regular (400 weight), comfortable 1.6 line height
  - Base: 1rem (16px)
  - Small: 0.875rem (14px)
  - Tiny: 0.75rem (12px)

## Layout System
- **Spacing Units**: Tailwind spacing - primarily use `p-4`, `p-6`, `p-8`, `gap-4`, `gap-6`, `gap-8`, `space-y-6`, `space-y-8`
- **Container Max-widths**: 
  - Marketing pages: `max-w-7xl`
  - App content: `max-w-6xl`
  - Forms/modals: `max-w-2xl`
- **Grid Systems**: 12-column grid for dashboards, 3-4 columns for card layouts
- **Card Padding**: `p-6` standard, `p-8` for hero cards

## App Shell Structure
- **Left Sidebar**: Fixed width 240px, dark navy background, vertical navigation with icons
- **Top Bar**: Height 64px, contains organization switcher, search, notifications, user profile
- **Main Content Area**: Scrollable, padding `p-6` to `p-8`, cards with rounded corners `rounded-lg`

## Component Library

### Navigation
- Sidebar links: Icon + text, active state with teal accent and subtle background
- Top navigation: Horizontal tabs for sub-sections, underline active indicator

### Cards & Panels
- Background: `#0F172A` on `#050816` base
- Border: Subtle `border border-gray-800`
- Rounded corners: `rounded-lg` (8px)
- Shadow: Subtle elevation with `shadow-xl`
- Spacing: `p-6` internal padding, `gap-6` between cards

### Buttons
- Primary: Teal background `#22D3EE`, dark text, rounded `rounded-md`, padding `px-6 py-3`
- Secondary: Dark gray with border, off-white text
- Danger: Red accent for destructive actions
- Ghost: Transparent with hover state
- Icon buttons: Square 40px with centered icon

### Forms
- Input fields: Dark background `#111827`, border `#374151`, focus ring teal
- Labels: Small caps, gray `#9CA3AF`, above inputs
- Validation: Inline error messages in red, success in emerald
- File upload: Drag-and-drop zone with dashed border, prominent icon

### Data Display
- Tables: Striped rows (alternating `#0F172A` and `#111827`), sticky headers, hover states
- Charts: Use Recharts or similar with coordinated blue/teal/amber palette
- Badges: Small rounded pills for tags (category, status), colored by type
- KPI Cards: Large number, label below, trend indicator with arrow icon

### Modals & Overlays
- Backdrop: Dark overlay `bg-black/50`
- Modal: `#0F172A` background, max-width based on content, centered
- Close button: Top-right corner, ghost style

## Page-Specific Guidelines

### Marketing Landing Page
- **Hero Section**: Full viewport height, centered content
  - Large heading (H1) with gradient text effect (blue to teal)
  - Subheading in gray
  - Two CTA buttons: Primary (teal) + Secondary (outlined)
  - Hero image: Dashboard preview mockup on right side, subtle glow effect
- **How It Works**: 3-column grid with numbered steps, icons, descriptions
- **Benefits**: 4-card grid highlighting key features with icons
- **Testimonials**: Dark cards with quotes, company logos, headshots
- **Footer**: Multi-column with links, logo, social icons, newsletter signup

### Dashboard (Authenticated)
- **KPI Row**: 4-5 metric cards across top with large numbers, labels, trend indicators
- **Charts Section**: 2-column grid
  - Spend over time: Line chart with gradient fill
  - Spend by category: Horizontal bar chart
  - Department breakdown: Donut/pie chart
- **Insights Cards**: List of AI-generated insights with severity badges (info/warning/critical)
- **Quick Actions**: Prominent CTAs for upload, budget, action plan

### Transactions Page
- **Filters Bar**: Horizontal row with dropdowns for date, category, department, vendor
- **Table**: Full-width with columns: Date, Vendor, Category, Department, Amount, Source, Actions
- **Bulk Actions**: Checkbox selection with action bar appearing at top

### Budget Builder
- **Overview Panel**: Total budget, period selector, status indicator
- **Category Breakdown**: Editable table with sliders or inputs for each category
- **Visualizations**: Side-by-side comparison of recommended vs actual, runway projections
- **Scenario Toggles**: Min/max range adjustments

## Images
- **Landing Hero**: Dashboard interface mockup showing charts and insights (right side, 50% width)
- **How It Works**: Icon illustrations for each step (upload, analyze, action)
- **Benefits Cards**: Icon illustrations representing each benefit
- **No photos for backgrounds** - keep focus on data and interface clarity

## Animations
- Minimal usage - subtle fade-ins for cards on scroll
- Chart animations on data load (progressive reveal)
- Hover states: gentle scale (1.02) or border glow on cards
- No complex scroll-triggered animations

## Accessibility
- High contrast text ratios maintained across all surfaces
- Focus indicators with teal ring
- Keyboard navigation for all interactive elements
- ARIA labels for icon-only buttons