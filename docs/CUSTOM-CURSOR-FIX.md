# Custom Cursor Fix - BROKE Dashboard

## Problem

The BROKE logo custom cursor was showing the native black pointer cursor alongside it when hovering over:
- Recharts chart elements (tooltips, axes, data points)
- Table rows and cells
- Interactive dashboard elements (buttons, links)

The issue was intermittent - it would work initially but break after interactions like clicking platform filters.

## Root Cause

**Multiple issues combined:**

1. **CSS `cursor: none` is unreliable** - Browsers have inconsistent behavior with `cursor: none`, especially during rapid DOM updates and hover state changes.

2. **Recharts injects inline styles** - Recharts dynamically adds `style="cursor: pointer"` to SVG elements at runtime.

3. **Browser style caching** - The browser's style calculation would get "stuck" and not update the cursor properly. Opening DevTools would force a style recalculation and fix it temporarily.

4. **Custom cursor visibility** - The `DashboardCursor` component was hiding itself (`opacity: 0`) on `mouseleave` events, and when switching tabs/windows rapidly, the `mouseenter` event wouldn't fire to show it again.

## Solution

### Part 1: Transparent Cursor Image Instead of `cursor: none`

Instead of using `cursor: none` (which has unreliable browser support), we use a **transparent 1x1 pixel PNG** as the cursor. This goes through a different browser code path and is more reliable.

```css
/* Transparent 1x1 PNG cursor */
cursor: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==') 0 0, none !important;
```

This is applied in:
- `src/styles/broke-dashboard.css` (top and bottom of file for cascade priority)
- `src/components/broke/dashboard/CursorContext.tsx` (dynamically injected style tag)

### Part 2: Force Style Recalculation

To prevent browser style caching issues, we force a style recalculation at 60fps by toggling a CSS transform:

```tsx
// In CursorContext.tsx
let toggle = false;
const forceStyleRecalc = () => {
  toggle = !toggle;
  document.documentElement.style.transform = toggle ? 'translateZ(0)' : '';
  void document.documentElement.offsetHeight;
};

// Run continuously at 60fps
let rafId: number;
const loop = () => {
  forceStyleRecalc();
  rafId = requestAnimationFrame(loop);
};
rafId = requestAnimationFrame(loop);
```

### Part 3: Keep Custom Cursor Always Visible

The `DashboardCursor` component was modified to never hide on `mouseleave`:

```tsx
// In DashboardCursor.tsx
const onLeave = () => {}; // Do nothing - keep cursor visible
const onEnter = () => setVisible(true);
```

### Part 4: Tooltip Cursor Disabled

All Recharts `<Tooltip>` components have `cursor={false}` to prevent Recharts from rendering its own cursor overlay:

```tsx
<Tooltip
  cursor={false}
  content={...}
/>
```

Applied to:
- `GrowthTrendChart.tsx`
- `PlatformBarChart.tsx`
- `EngagementScatter.tsx`
- `ComparisonChart.tsx`
- `PlatformDonut.tsx`

## Files Modified

| File | Change |
|------|--------|
| `src/components/broke/dashboard/CursorContext.tsx` | Transparent cursor, style recalc loop |
| `src/components/broke/dashboard/DashboardCursor.tsx` | Never hide on mouseleave |
| `src/styles/broke-dashboard.css` | Transparent cursor CSS rules |
| `src/components/broke/dashboard/charts/*.tsx` | `cursor={false}` on Tooltips |

## Why This Works

1. **Transparent cursor image** - Forces the browser to render a custom cursor (even if invisible) instead of relying on the potentially buggy `cursor: none` behavior.

2. **Continuous style recalc** - Mimics what DevTools does when open, preventing the browser's style cache from getting stale.

3. **Always-visible custom cursor** - Prevents the BROKE logo from disappearing due to missed mouseenter events.

4. **High CSS specificity** - Rules at both top and bottom of CSS file with `html body` prefix ensure they win the cascade.

## Testing Checklist

- [ ] Navigate to `/broke/dashboard` - BROKE cursor only
- [ ] Hover over growth trend chart - BROKE cursor only
- [ ] Click between TikTok/Instagram/Twitter filters on Leaderboard - BROKE cursor only
- [ ] Navigate to Compare page, click between platform filters - BROKE cursor only
- [ ] Hover over table rows - BROKE cursor only
- [ ] Switch browser tabs and return - BROKE cursor still works
- [ ] Toggle Money Mode - cash gun cursor works
