---
name: PrevidênciaInvest Modern Finance
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#3e4945'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#6e7a74'
  outline-variant: '#bec9c3'
  surface-tint: '#016b55'
  primary: '#00513f'
  on-primary: '#ffffff'
  primary-container: '#006b55'
  on-primary-container: '#94e8cc'
  inverse-primary: '#82d6bb'
  secondary: '#4648d4'
  on-secondary: '#ffffff'
  secondary-container: '#6063ee'
  on-secondary-container: '#fffbff'
  tertiary: '#3e465b'
  on-tertiary: '#ffffff'
  tertiary-container: '#565e74'
  on-tertiary-container: '#d0d8f2'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#9ef3d7'
  primary-fixed-dim: '#82d6bb'
  on-primary-fixed: '#002018'
  on-primary-fixed-variant: '#005140'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c1ff'
  on-secondary-fixed: '#06006c'
  on-secondary-fixed-variant: '#2e2ebe'
  tertiary-fixed: '#dae2fc'
  tertiary-fixed-dim: '#bec6e0'
  on-tertiary-fixed: '#131b2e'
  on-tertiary-fixed-variant: '#3e465b'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
  success-emerald: '#10b981'
  warning-amber: '#f59e0b'
  danger-red: '#ba1a1a'
  info-cyan: '#06b6d4'
  accent-pink: '#ec4899'
  accent-indigo: '#6366f1'
  surface-glass: rgba(255, 255, 255, 0.8)
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-padding: 24px
  gutter: 20px
  margin-desktop: 32px
  margin-mobile: 16px
  sidebar-width: 260px
---

## Brand & Style
The brand identity is centered on **Trust, Growth, and Analytical Clarity**. It targets sophisticated retail investors who value long-term wealth building (Previdência) through data-driven decisions. 

The visual style is **Corporate Modern with a Glassmorphic edge**. It balances the reliability of a traditional financial institution with the agility of a modern fintech platform. The UI uses a "Soft-Glass" aesthetic—combining clean, structured layouts with translucent, blurred surfaces and subtle gradients to create a sense of depth and premium quality without sacrificing legibility.

## Colors
The palette is dominated by **Investment Green** (#006b55) and **Growth Emerald** (#00b894), symbolizing financial health and positive momentum. 

- **Primary:** Used for main actions, brand identity, and positive growth indicators.
- **Secondary:** Used for utility actions (sync, install) and secondary data points.
- **Surface Strategy:** The background uses a very light cool-grey (#f7f9fb) to reduce eye strain. Cards utilize a semi-transparent white with backdrop filters to create the glass effect.
- **Semantic Accents:** High-vibrancy colors are used sparingly for asset classes (FIIs, Actions) and status alerts (Dividends, Warnings) to ensure immediate information hierarchy in data-heavy tables.

## Typography
The system utilizes **Inter** exclusively to maintain a clean, utilitarian, and highly legible interface essential for financial data.

- **Weight Strategy:** Bold (700) is reserved for brand and primary totals. Semi-bold (600) is used for section headers. Medium (500) identifies interactive labels and table headers.
- **Data Tables:** Numerical data should use a consistent 14px size (label-md) with semi-bold weights for "Current Price" and "Total" to stand out from reference values like "Average Price".
- **Gradients:** Primary headlines may use a linear gradient from Primary to Primary-Container for a signature brand touch.

## Layout & Spacing
The layout follows a **Fixed Sidebar + Fluid Content** model. 

- **Sidebar:** A permanent 260px left-hand navigation on desktop, collapsing to a hamburger/bottom-nav on mobile.
- **Grid:** A flexible grid system is used for metric cards, transitioning from 1 column (mobile) to 2 columns (tablet) to 4 columns (wide desktop).
- **Rhythm:** An 8px base unit (unit) governs all spacing. Page margins are generous (32px) to provide "breathing room" for dense financial tables.
- **Grouping:** Related metrics are grouped in 20px-gap gutters, while internal card content uses 24px padding for a premium feel.

## Elevation & Depth
Depth is created through transparency and blur rather than heavy shadows.

- **Glass Layers:** Cards use `backdrop-filter: blur(20px)` with a 1px white border at 50% opacity. This creates a "sheet of glass" effect over the background.
- **Shadows:** A single, very soft ambient shadow is used for cards: `0 4px 30px rgba(70, 72, 212, 0.05)`. Note the subtle blue/secondary tint in the shadow color.
- **Active State:** Primary buttons use a stronger, brand-tinted glow shadow (`rgba(0, 107, 85, 0.39)`) to suggest they are "floating" slightly higher than other elements.
- **Layering:** The TopAppBar uses a blur effect with 80% background opacity to stay pinned while content scrolls underneath.

## Shapes
The shape language is **Refined and Softly Geometric**.

- **Cards & Major Elements:** Use a 12px (0.75rem / xl) or 16px corner radius to feel modern and approachable.
- **Buttons & Small Components:** Use an 8px (0.5rem / lg) radius to maintain a crisp, professional edge.
- **Icons & Chips:** Use fully rounded (pill) shapes for status badges and class identifiers to distinguish them from interactive buttons.
- **Selection State:** Active menu items in the sidebar use a subtle 8px radius background.

## Components
- **Buttons:** 
  - *Primary:* Solid Primary color with a subtle hover scale (1.02x).
  - *Secondary:* Outline or soft-tint (5% opacity) backgrounds.
- **Data Tables:**
  - Headers must be uppercase and slightly faded (70% opacity) for structural clarity.
  - Rows should include a subtle hover highlight and transition for better row-tracking.
  - Interactive "Actions" should remain hidden (opacity 0) until row hover to reduce visual noise.
- **Metric Cards:**
  - Feature a "background glow" in the bottom-right corner, color-coded to the metric's purpose (e.g., Green for Wealth, Amber for Yield).
- **Class Badges (Chips):**
  - Use a 10% background tint of the semantic color with a 14px icon. Text must be 12px (label-sm) and semi-bold.
- **Input/Search:**
  - Should mirror the button shape (8px) with a subtle 30% opacity border-variant for an unobtrusive look.