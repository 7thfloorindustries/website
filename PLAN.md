# Fix Dashboard Custom Cursor - SVG and Form Elements

## Problem

The BROKE logo custom cursor reverts to native pointer cursor when hovering over:
- The table in `/broke/dashboard/compare`
- Charts (Recharts SVG elements)
- Checkbox inputs
- Sortable table headers

## Root Cause

The current CSS `cursor: none !important` rules don't cover:

1. **SVG elements from Recharts** - The library renders interactive SVG elements (`<svg>`, `<g>`, `<path>`, `<circle>`, `<line>`, `<rect>`) that inherit browser default `cursor: pointer`
2. **Recharts-specific classes** - `.recharts-*` elements aren't targeted
3. **Native form elements** - Browser applies default cursor to `<input type="checkbox">`

## Solution

Add comprehensive SVG and Recharts selectors to the cursor override rules in `broke-dashboard.css`.

---

## Implementation

### File: `src/styles/broke-dashboard.css`

Add these selectors to the existing cursor override block (around line 213):

```css
/* SVG elements from Recharts and other chart libraries */
body.dashboard-cursor-active svg,
body.dashboard-cursor-active svg *,
body.dashboard-cursor-active g,
body.dashboard-cursor-active path,
body.dashboard-cursor-active circle,
body.dashboard-cursor-active line,
body.dashboard-cursor-active rect,
body.dashboard-cursor-active polygon,
body.dashboard-cursor-active polyline,
body.dashboard-cursor-active text,
body.dashboard-cursor-active tspan,

/* Recharts specific elements */
body.dashboard-cursor-active .recharts-wrapper,
body.dashboard-cursor-active .recharts-wrapper *,
body.dashboard-cursor-active .recharts-surface,
body.dashboard-cursor-active .recharts-layer,
body.dashboard-cursor-active .recharts-tooltip-cursor,
body.dashboard-cursor-active .recharts-active-dot,
body.dashboard-cursor-active .recharts-legend-wrapper,
body.dashboard-cursor-active .recharts-legend-item,
body.dashboard-cursor-active [class^="recharts-"],
body.dashboard-cursor-active [class*=" recharts-"],

/* Form elements with explicit targeting */
body.dashboard-cursor-active input[type="checkbox"],
body.dashboard-cursor-active input[type="radio"],
body.dashboard-cursor-active input[type="checkbox"]:hover,
body.dashboard-cursor-active input[type="radio"]:hover,

/* ResponsiveContainer */
body.dashboard-cursor-active .recharts-responsive-container,
body.dashboard-cursor-active .recharts-responsive-container * {
  cursor: none !important;
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/styles/broke-dashboard.css` | Add SVG, Recharts, and form element selectors to cursor override |

---

## Verification

1. Navigate to `/broke/dashboard/compare`
2. Hover over the comparison chart - should show ONLY BROKE cursor
3. Hover over sortable table headers - should show ONLY BROKE cursor
4. Hover over checkboxes - should show ONLY BROKE cursor
5. Click to select creators and interact with chart - cursor should remain BROKE logo only
6. Test on other dashboard pages with charts (Overview, Leaderboard)
