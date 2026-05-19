# V15 Vegas/Sentiment Visual + Glide Turnover

Date: 2026-05-18
Scope: Body-only visual parity handoff for `/vegas-intel` and `/sentiment`, plus the V15 Glide operational-data contract that must be carried into V16.

## Executive Decision

This is a translation spec, not a code-port request.

V16 is a clean-room rebuild. Do not paste V15 TSX, Python, SQL, or API route code into V16. Rebuild from scratch using the values and relationships below as the visual/data contract.

Top navigation and top page headers are locked. Preserve the current V16 `BackendShell`, current top nav, and the current page header blocks unless Kirk explicitly reopens them. The work is body layout, card treatment, color fidelity, responsive behavior, and Glide data depth.

## Evidence Read

V15 visual source files:

- `/Volumes/Satechi Hub/ZINC-FUSION-V15/frontend/src/app/vegas-intel/page.tsx`
- `/Volumes/Satechi Hub/ZINC-FUSION-V15/frontend/src/app/sentiment/page.tsx`
- `/Volumes/Satechi Hub/ZINC-FUSION-V15/frontend/src/app/globals.css`

V15 Glide source files:

- `/Volumes/Satechi Hub/ZINC-FUSION-V15/frontend/src/lib/vegasGlide.ts`
- `/Volumes/Satechi Hub/ZINC-FUSION-V15/frontend/src/app/api/vegas/sync/route.ts`
- `/Volumes/Satechi Hub/ZINC-FUSION-V15/frontend/src/app/api/vegas/route.ts`
- `/Volumes/Satechi Hub/ZINC-FUSION-V15/frontend/src/app/api/vegas/fryers/route.ts`
- `/Volumes/Satechi Hub/ZINC-FUSION-V15/frontend/src/app/api/vegas/restaurants/route.ts`
- `/Volumes/Satechi Hub/ZINC-FUSION-V15/src/fusion/ingestion/glide_vegas.py`
- `/Volumes/Satechi Hub/ZINC-FUSION-V15/prisma/migrations/20260114_add_vegas_intel_tables/migration.sql`
- `/Volumes/Satechi Hub/ZINC-FUSION-V15/prisma/migrations/20260115_expand_predicthq_events/migration.sql`
- `/Volumes/Satechi Hub/ZINC-FUSION-V15/prisma/migrations/20260115_cuisine_affinity/migration.sql`

V16 target/gap files:

- `/Volumes/Satechi Hub/ZINC-FUSION-V16/app/(protected)/vegas-intel/page.tsx`
- `/Volumes/Satechi Hub/ZINC-FUSION-V16/app/(protected)/sentiment/page.tsx`
- `/Volumes/Satechi Hub/ZINC-FUSION-V16/app/api/vegas/intel/route.ts`
- `/Volumes/Satechi Hub/ZINC-FUSION-V16/app/config/vegas-intel-ai.json`
- `/Volumes/Satechi Hub/ZINC-FUSION-V16/supabase/migrations/202603180009_ops_vegas.sql`
- `/Volumes/Satechi Hub/ZINC-FUSION-V16/docs/plans/2026-03-17-v16-migration-plan.md`
- `/Volumes/Satechi Hub/ZINC-FUSION-V16/docs/plans/2026-05-09-directive-synthesis-page-data-training.md`
- `/Volumes/Satechi Hub/ZINC-FUSION-V16/docs/plans/2026-05-17-dashboard-revised-work-plan.md`

## Current V16 Gap

Vegas Intel:

- Current V16 page is only a thin AI-card shell.
- It has no V15 segment cards, event rows, countdown circles, account/opportunity rows, active segment filter, or dense Glide row layout.
- Current `/api/vegas/intel` reads `vegas.events`, `vegas.restaurants`, `vegas.customer_scores`, `vegas.fryers`, and `vegas.event_impact`, then overlays AI snapshot card text.
- It does not expose the V15 Glide details needed for the body UI: `oil_type`, `service_frequency`, `contact_person`, `casino` via Glide relation, `fryer_count`, `total_capacity_lbs`, `export_list`, `scheduled_reports`, or shift-linked service schedule context.

Sentiment:

- Current V16 page is a condensed AI-card view.
- V15 body is a richer Market Psychology workspace with seven sections: Fear & Greed, price strip, policy impact, market snapshot, volatility, market participants, and segmented headlines.
- Use V15 as body layout/token reference. Keep the V16 header locked unless reopened.

Global CSS:

- V16 has the core V15 token block, but the V15 phone breakpoint with Vegas inline-style overrides is absent.
- Missing Vegas-specific phone rules are required if the V15 Vegas body structure is rebuilt with equivalent class hooks.

## Shared Visual Tokens

Base page:

| Token | Exact Value |
|---|---|
| Page background | `#0a0a0a` |
| Global black | `#000000` |
| Primary text | `#ffffff` |
| Body text | Tailwind `slate-200` = `#e2e8f0` |
| Muted text | Tailwind `slate-400` = `#94a3b8` |
| Faint text | Tailwind `slate-500` = `#64748b` |
| Card background | `rgba(255, 255, 255, 0.02)` or Tailwind `bg-white/[0.02]` |
| Card border | `rgba(255, 255, 255, 0.10)` or Tailwind `border-white/10` |
| Inner subtle border | `rgba(255, 255, 255, 0.05)` or Tailwind `border-white/5` |
| Hover border | `rgba(255, 255, 255, 0.20)` or Tailwind `border-white/20` |
| Main card radius | `16px` via `rounded-2xl` |
| Inner card radius | `12px` via `rounded-xl` |
| Tiny badge radius | `2px` where V15 uses inline badges |
| Main card padding | `32px`; large sentiment top card uses `32px` mobile / `40px` desktop |
| Inner card padding | `16px`, `20px`, or `24px` per section below |
| Section margin bottom | `32px` for Sentiment; `48px` for Vegas sections |
| Transition | `all 0.2s ease` for Vegas custom controls; `duration-300`/`duration-700` for Sentiment Tailwind transitions |

Tailwind color translations used by the V15 pages:

| Class/Use | Hex |
|---|---|
| `blue-500` | `#3b82f6` |
| V15 canonical accent blue | `#2962FF` |
| `cyan-500` | `#06b6d4` |
| `cyan-400` | `#22d3ee` |
| `cyan-300` | `#67e8f9` |
| `emerald-500` | `#10b981` |
| `emerald-400` | `#34d399` |
| `emerald-300` | `#6ee7b7` |
| `green-500` explicit gauge | `#22c55e` |
| `lime-500` | `#84cc16` |
| `lime-400` | `#a3e635` |
| `yellow-400` | `#facc15` |
| explicit neutral gauge yellow | `#eab308` |
| `amber-500` | `#f59e0b` |
| `amber-400` | `#fbbf24` |
| `amber-300` | `#fcd34d` |
| `orange-500` | `#f97316` |
| `orange-400` | `#fb923c` |
| `red-500` | `#ef4444` |
| `red-400` | `#f87171` |
| `red-300` | `#fca5a5` |
| Vegas prospect dark red | `#b91c1c` |
| Vegas purple segment | `#a855f7` |
| Event fallback gray | `#6b7280` |

## Vegas Intel Body Layout Contract

Keep current V16 top header. Replace or rebuild the body below the header to match the V15 body structure.

### Section Order

1. Segment filter cards.
2. Upcoming events rows.
3. Account/opportunity rows.

### Body Shell

Use full width under `BackendShell`. Do not add a centered max-width container. The source page shell uses:

- `min-height: 100vh`
- background `#0a0a0a`
- text `slate-200`
- mobile padding `12px`
- desktop padding `24px`
- top padding already supplied by `BackendShell`: `pt-24` mobile / `pt-36` desktop
- bottom padding `80px`

### Segment Filter Grid

Layout:

- Display: CSS grid.
- Desktop columns: `repeat(4, 1fr)`.
- Gap: `12px`.
- Margin bottom: `48px`.
- Mobile phone override at max-width `480px`: `repeat(2, 1fr)` and gap `8px`.

Cards:

| Segment | Accent |
|---|---|
| All Accounts | `#3b82f6` |
| Customers | `#2dd4bf` |
| Prospects | `#ef4444` |
| Upcoming Events | `#a855f7` |

Card styling:

- Inactive background: `rgba(255, 255, 255, 0.02)`.
- Active background: accent color with alpha suffix `15` (example `#3b82f615`).
- Inactive border: `1px solid rgba(255, 255, 255, 0.08)`.
- Active border: `2px solid [accent]`.
- Left border: always `4px solid [accent]`.
- Padding: `20px 16px`.
- Min height: `140px`.
- Display: flex column.
- Justify content: `space-between`.
- Cursor: pointer.
- Transition: `all 0.2s ease`.
- Text align: left.
- No rounded corners in V15 segment cards.

Segment card typography:

- Main value: `36px`, weight `700`, line-height `1`, margin bottom `6px`, color active accent or `rgba(255,255,255,0.9)`.
- Label: `11px`, weight `600`, uppercase, letter spacing `0.5px`, color active accent or `rgba(255,255,255,0.5)`.
- Stats row: display flex, gap `16px`, margin top `16px`, padding top `12px`, border top `1px solid rgba(255,255,255,0.08)`.
- Stat value: `14px`, weight `600`, color `rgba(255,255,255,0.8)`.
- Stat label: `9px`, weight `500`, uppercase, letter spacing `0.5px`, color `rgba(255,255,255,0.4)`.

### Upcoming Events Section

Section:

- Margin bottom: `48px`.
- Heading: `12px`, weight `600`, uppercase, letter spacing `1px`, opacity `0.6`, margin bottom `16px`.
- Row stack: flex column, gap `2px`.
- Show max 8 events in the first pass.

Event row:

- Class hook equivalent: `vegas-event-row`.
- Background `rgba(255, 255, 255, 0.02)`.
- Border `1px solid rgba(255, 255, 255, 0.08)`.
- Padding `20px 24px`.
- Display flex.
- Align center.
- Gap `24px`.
- No radius in V15.
- Phone max-width `480px`: flex direction column, align stretch, gap `8px`.

Event left column:

- Container flex `1`, min width `0`.
- Event name: `16px`, weight `600`, color `rgba(255,255,255,0.95)`, margin bottom `6px`.
- Location/category row: display flex, align center, gap `8px`, margin bottom `6px`.
- Venue text: `13px`, color `rgba(255,255,255,0.5)`.
- Category badge: `10px`, weight `600`, uppercase, padding `2px 8px`, background `[event color]20`, text `[event color]`, border radius `2px`.
- Date text: `12px`, color `rgba(255,255,255,0.4)`.

Event right stats:

- Class hook equivalent: `vegas-event-stats`.
- Display flex, align center, gap `16px`, flex shrink `0`.
- Phone max-width `480px`: flex wrap and gap `8px`.
- Attendance number: `20px`, weight `700`, color `rgba(255,255,255,0.9)`, text align right.
- Attendance label: `10px`, uppercase, color `rgba(255,255,255,0.4)`.

Countdown circles:

- Width/height `52px`.
- Radius `50%`.
- Border `3px solid [circleColor]`.
- Display flex column, center both axes.
- Value: `16px`, weight `700`, color `rgba(255,255,255,0.9)`, line-height `1`.
- Label: `8px`, uppercase, color `rgba(255,255,255,0.5)`.
- Urgency colors: `<=7 days` = `#ef4444`; `<=21 days` = `#f59e0b`; otherwise `#22c55e`.
- Duration circle forced color: `#06b6d4`.

### Account / Opportunity Rows

Section:

- Margin bottom `48px`.
- Heading uses same `12px`/uppercase/`1px` letter spacing/opacity `0.6`/margin bottom `16px` style as events.
- Row stack: flex column, gap `8px`.
- Show max 15 opportunities in the first pass.

Opportunity row:

- Class hook equivalent: `vegas-opp-row`.
- Display flex, align stretch.
- Background `rgba(255, 255, 255, 0.02)`.
- Border `1px solid rgba(255, 255, 255, 0.08)`.
- Overflow hidden.
- No radius in V15.
- Phone max-width `480px`: flex direction column, align stretch, gap `8px`.

Accent bar:

- Width `4px`.
- Background: customer `#2dd4bf`; prospect `#b91c1c`.
- Flex shrink `0`.

Opportunity content:

- Display flex, align center, gap `16px`.
- Padding `16px 24px`.
- Flex `1`.
- Main content flex `1`, min width `0`.
- Title row: display flex, align center, gap `12px`, margin bottom `4px`.
- Title text: `15px`, weight `600`.
- Meta text: `12px`, opacity `0.5`.

Prospect badge:

- Font `10px`, weight `600`, uppercase, letter spacing `0.5px`.
- Padding `2px 8px`.
- Background `rgba(185, 28, 28, 0.2)`.
- Color `#f87171`.
- Radius `2px`.

Intel button:

- Padding `8px 16px`.
- Font `12px`, weight `600`.
- Background transparent.
- Border `1px solid rgba(255,255,255,0.2)`.
- Radius `2px`.
- Text `rgba(255,255,255,0.8)`.
- Cursor pointer.
- Flex shrink `0`.

### Vegas Empty/Loading Rows

- Padding `40px`.
- Text align center.
- Opacity `0.5`.
- Background `rgba(255,255,255,0.02)`.
- Border `1px solid rgba(255,255,255,0.08)`.

## Vegas Intel Behavior / Sales Logic Contract

This section is as important as the visual contract. V16 should not only repaint the page; it must preserve the operational behavior behind Kevin's Vegas page.

### Page Data Pulls and UI State

V15 client-side page behavior:

- On mount, fetch stats from `/api/vegas?view=stats`.
- On mount, fetch restaurants from `/api/vegas?view=restaurants`.
- On mount, fetch events from `/api/vegas?view=events`.
- Event rows are sorted client-side by `daysUntil` ascending before display.
- Display only the first 8 event rows on the main body.
- Restaurant rows are transformed into opportunities on the client.
- A restaurant is treated as a customer when `service_frequency` exists and is not blank.
- A restaurant is treated as a prospect when `service_frequency` is blank or missing.
- Segment cards compute counts, fryer totals, and capacity totals from the transformed opportunities.
- Active segment filters opportunities by `all`, `customers`, `prospects`, or `events`.
- The `events` segment still shows all account rows.
- Display only the first 15 opportunity rows on the main body.

Important V15 limitation:

- The visible `Intel` button in each opportunity row is only a visual button in the inspected V15 TSX. It has no click handler, no route call, and no modal in that file. V16 should not assume a completed V15 per-account script workflow exists behind that button.

### Event Pull Logic

V15 event API behavior:

- Route: `/api/vegas?view=events`.
- Source tables: `vegas.vegas_events`, `vegas.vegas_event_venues`, `vegas.vegas_venues`.
- Filter: `e.is_active = true`.
- Filter: `e.start_date >= CURRENT_DATE`.
- Query limit: 50 events.
- API ordering: `attendance DESC NULLS LAST`, then `start_date ASC`.
- Page ordering after fetch: `daysUntil ASC`.
- Returned fields:
  - `id` from `event_id`
  - `name`
  - `category` from `event_type`
  - `venue`
  - `attendance`, default `0`
  - `startDate`
  - `endDate`
  - `daysUntil`
  - `latitude`
  - `longitude`
  - `address`
  - `color`

Event colors:

| Category | Color |
|---|---|
| `expos` | `#2962FF` |
| `conferences` | `#14b8a6` |
| `concerts` | `#a855f7` |
| `sports` | `#22c55e` |
| `festivals` | `#ff6b35` |
| `performing-arts` | `#f59e0b` |
| `community` | `#06b6d4` |
| `school-holidays` | `#ec4899` |
| fallback | `#6b7280` |

V15 event-schema depth from `20260115_expand_predicthq_events`:

- PredictHQ event storage includes event description, alternate titles, category, rank, local rank, duration, start/end timestamps, predicted end time, timezone, scope, brand safety, state, first seen, PHQ update time, confidence scores, predicted event spend, hospitality spend, accommodation spend, transportation spend, venue geo, labels with weights, daily impact rows, and event entities.
- The page currently renders only a small subset, but V16 should preserve the richer storage path for pitch intel and future drill-ins.
- The event impact table is the demand calculator backbone: `event_id`, `vertical`, `impact_type`, `impact_date`, `impact_value`, and `position`.
- The hospitality-demand view aggregates `vertical = 'hospitality'` by date.
- The event summary materialized view combines event, venue, labels, spend, rank, local rank, and total hospitality impact.

### Daily Spend / Demand Window Logic

V15 route: `/api/vegas?view=daily-spend`.

Purpose:

- Provide a 90-day forward demand calendar for dashboard sparklines and heat-calendar style planning.

Logic:

- Reads `vegas.vegas_daily_spend`.
- Filters `impact_date >= CURRENT_DATE`.
- Orders by `impact_date`.
- Limits to 90 rows.
- Returns category spend columns for concerts, conferences, expos, festivals, performing arts, sports, and total.
- Computes top category per day using the greatest category spend.
- Counts active events on that date from `vegas.vegas_events`.
- Computes summary values:
  - `totalSpend`
  - `avgDailySpend`
  - `peakDay`
  - `daysLoaded`

V16 should expose this or an equivalent if the Vegas page shows event-pressure timing, pitch timing recency, or service scheduling windows.

### ZFusion Opportunity Scoring Logic

V15 route: `/api/vegas?view=zfusion&eventId=<event_id>`.

Formula:

`Expected Spend x Cuisine Affinity x PHQ Signal -> ZFusion Score`

Inputs:

- Event details from `vegas.vegas_events`.
- Event category from `event_type`; fallback `concerts`.
- Daily category spend from `vegas.vegas_daily_spend` for the event start date.
- Restaurant cuisine type from `vegas.vegas_restaurants.cuisine_type`.
- Casino name via casino Glide relation.
- Cuisine affinity scores from `vegas.vegas_cuisine_affinity`.

PHQ multiplier:

- V15 does not use real rank/local-rank in the route yet.
- It approximates the PHQ signal from attendance.
- Attendance is capped at `100000`.
- `attendanceScore = min(100000, attendance || 5000) / 100000`.
- `phqMultiplier = 0.5 + (attendanceScore * 1.5)`.
- Range is `0.5` to `2.0`.

Restaurant scoring:

- Default cuisine affinity is `30` when no cuisine match exists.
- Restaurants with `cuisine_type = 'service'` are excluded from dining opportunity scoring.
- Spend share is `(affinity_score / total_affinity) * categorySpend`.
- Score is normalized as `LEAST(100, ((affinity_score / total_affinity) * categorySpend / 10000) * phqMultiplier)`.
- Results order by `zfusion_score DESC`, then `affinity_score DESC`.
- Limit 50.
- Returned reason uses `vegas_cuisine_affinity.reasoning`, defaulting to `General dining option`.

### Cuisine-Aware Pitch Intel

V15 seed table: `vegas.vegas_cuisine_affinity`.

This is the closest inspected V15 source to "sales script" reasoning. It is not generic copy; it maps event categories to cuisine types with `0-100` affinity scores and short sales-facing reasoning.

Event categories seeded in V15:

- `expos`
- `conferences`
- `concerts`
- `sports`
- `festivals`
- `performing-arts`

Cuisine types seeded in V15:

- `steakhouse`
- `burger`
- `asian`
- `mexican`
- `italian`
- `seafood`
- `pub`
- `buffet`
- `cafe`
- `chicken`
- `pizza`
- `bbq`
- `american`
- `service`

Examples of reasoning style to preserve:

- Expos and conferences emphasize business dinners, expense accounts, networking, group-friendly meals, and catering/banquet service.
- Concerts emphasize pre-show/post-show food, casual speed, late-night demand, and arena concessions.
- Sports emphasize sports-bar culture, wings, burgers, group sharing, and suite/arena catering.
- Festivals emphasize portable, shareable, quick-service food.
- Performing arts emphasizes pre-theater dining, upscale sit-down meals, and VIP/intermission service.

V16 pitch cards should derive copy from this kind of structured event/cuisine/account evidence, not from generic LLM sales language.

### Intel Sheets / Sales Collateral Storage

V15 schema includes `vegas.vegas_intel_sheets` for generated sales collateral and tracking:

- `sheet_id`
- `restaurant_id`
- `event_id`
- `sheet_type`
- `headline`
- `content` JSONB
- `shareable_url`
- `pdf_url`
- `view_count`
- `last_viewed_at`
- `sent_at`
- `sent_to`
- `status`, default `draft`

Inspected state:

- The table contract exists.
- The V15 page's `Intel` button does not yet call a sheet-generation endpoint.
- No inspected V15 route implements a complete per-account script/PDF/share flow.

V16 implementation rule:

- Keep the `Intel` affordance, but wire it deliberately.
- If implementing now, create a server-side route that takes a verified `restaurant_id` and optional `event_id`, reads real restaurant/fryer/oil/service/event/cuisine data, then returns or stores a draft intel sheet.
- Do not generate pitch copy from client-only data.
- Do not send, share, or mark collateral as sent without an explicit user action.
- Default status should remain draft.

### Current V16 AI Sales Strategy Layer

V16 already has an AI-card/provenance layer in `/api/vegas/intel` and `app/config/vegas-intel-ai.json`. Preserve that idea, but strengthen it with the V15 operational fields.

Current V16 card keys:

- `upcomingEvents`
- `aiSalesStrategy`
- `restaurantAccounts`
- `fryerTracking`

Current V16 sales-strategy instruction themes:

- Map near-term event concentration to procurement and service-demand timing.
- Generate account-targeted sales strategy tied to oil-cost control, demand timing, and service profile.
- Rank accounts by event sensitivity, volume pressure, and service-cycle urgency.
- Align the pitch angle to cost certainty and operational continuity.
- Avoid generic sales copy detached from account context.
- Separate account coverage from fryer telemetry completeness.

Current V16 fallback data limits:

- Events query only selects `id`, `event_name`, and `event_date`.
- Restaurants query only selects `id`, `restaurant_name`, and `account_status`.
- Fryers query only selects `restaurant_id` and `fryer_count`.
- Customer scores query only selects `restaurant_id`, `score_date`, and `score`.
- Event impact query only selects `event_id`, `restaurant_id`, and `impact_score`.

Needed V16 upgrade:

- Keep the V16 AI-card/provenance pattern.
- Add V15/Vegas operational depth so the AI layer can reference oil type, service frequency, casino/property, fryer count, capacity, shifts/scheduled reports, event category, attendance, hospitality impact, cuisine affinity, and account score.
- The card body should include count math and timing math when it makes a recommendation.
- The card should hard-stop when verified event/account/service rows are missing.

### Sales Script / Pitch Output Contract

When the V16 agent implements the pitch/intel behavior, use this output structure:

- `restaurantId`
- `restaurantName`
- `casinoName`
- `eventId` or selected event window
- `eventName`
- `eventCategory`
- `eventDate`
- `daysUntil`
- `attendance`
- `hospitalityImpact` or event impact score
- `oilType`
- `oilForm`
- `serviceFrequency`
- `fryerCount`
- `totalCapacityLbs`
- `customerStatus`
- `opportunityScore`
- `pitchAngle`
- `salesScript`
- `evidenceBullets`
- `nextAction`
- `provenance`

Pitch angle rules:

- Expos/conferences: business volume, expense-account dining, group meals, catering/banquet readiness, predictable oil supply.
- Concerts/festivals: pre/post-event rush, quick-service volume, late-night demand, throughput protection.
- Sports: game-day surge, wings/burgers/pub demand, suite/catering support, fryer uptime.
- Performing arts: pre-show reservation windows, premium dining, reliable oil quality, service timing before show windows.
- High fryer count/capacity: operational continuity and downtime risk.
- Missing fryer count/capacity: state the missing telemetry and avoid equipment-specific claims.
- Missing oil type: do not invent product fit; say oil product is not yet populated.

## Sentiment Body Layout Contract

Keep current V16 top header. Rebuild the body sections below the header using the V15 section order and density.

### Section Order

1. Fear & Greed Composite.
2. Hero Price Strip.
3. Impact on Soybean Oil Futures.
4. Market Snapshot.
5. Market Volatility.
6. Market Participants.
7. Segmented Policy News Lanes.

### Shared Sentiment Card Pattern

Outer cards:

- Background `#0a0a0a`.
- Border `1px solid rgba(255,255,255,0.10)`.
- Radius `16px`.
- Padding `32px`.
- Fear & Greed card uses `32px` mobile and `40px` desktop.
- Hover border `rgba(255,255,255,0.20)`.
- Transition `all 300ms`.
- Section wrapper margin bottom `32px`.

Section title:

- Font size `14px`.
- Weight `600`.
- Color `slate-400` = `#94a3b8`.
- Uppercase.
- Letter spacing `0.1em` / Tailwind `tracking-widest`.
- Left border `2px solid [section accent]`.
- Padding left `12px`.
- Margin bottom `32px` where the title sits inside a card.

Section accents:

| Section | Accent |
|---|---|
| Fear & Greed Composite | `blue-500` = `#3b82f6` |
| Impact on Soybean Oil Futures | `amber-500` = `#f59e0b` |
| Procurement Outlook nested box | `cyan-500/30` = `rgba(6,182,212,0.3)` |
| Crude Oil / Soybean Oil Cross | `amber-500` = `#f59e0b` |
| Market Volatility | `purple-500` = `#a855f7` |
| Market Snapshot heading icon | `cyan-400` = `#22d3ee` |
| Market Participants icon | `slate-400` = `#94a3b8` |
| Headlines icon | `blue-400` = `#60a5fa` |

### Fear & Greed Composite

Outer card: shared card pattern with `p-8 md:p-10`.

Loading state:

- Centered column.
- Padding Y `48px`.
- Gauge skeleton `256px x 128px`, background white 5%, rounded full, margin bottom `24px`.
- Score skeleton `48px x 96px`, background white 5%, rounded, margin bottom `12px`.
- Label skeleton `24px x 128px`, background white 5%, rounded.

Loaded state:

- Gauge centered with `max-width: 28rem`.
- Score: `60px`/Tailwind `text-6xl`, weight `700`, white, margin top `16px`.
- Zone label: `24px`/`text-2xl`, weight `600`, margin top `8px`, color by zone:
  - extreme fear `#ef4444`
  - fear `#fb923c`
  - neutral `#facc15`
  - greed `#a3e635`
  - extreme greed `#34d399`
  - default `#94a3b8`
- Interpretation: `18px`, `#cbd5e1`, margin top `8px`, centered, max width `512px`.

Gauge gradient:

- SVG viewbox `300 170`.
- Arc path `M 30 150 A 120 120 0 0 1 270 150`.
- Stroke width `24`, round caps.
- Gradient stops: `0% #ef4444`, `25% #f97316`, `50% #eab308`, `75% #84cc16`, `100% #22c55e`.
- Needle stroke white, width `3`, round caps.
- Center dot `r=8`, white.

Component breakdown:

- Border top `rgba(255,255,255,0.05)`.
- Padding top `24px`.
- Label: `12px`, `#64748b`, uppercase, tracking widest, weight `700`, margin bottom `16px`.
- Grid: `1` column mobile, `2` columns small, `3` columns large, gap `16px`.
- Component row: flex, align center, gap `12px`.
- Label width `112px`, `14px`, `#94a3b8`, no shrink.
- Track height `10px`, `#1e293b`, rounded full, overflow hidden.
- Value width `36px`, mono, right aligned.
- Tilt width `56px`, `10px`, `#64748b`, uppercase, tracking wide, right aligned.
- Component bar colors:
  - null `#334155`
  - `<=25` `#ef4444`
  - `<=40` `#f97316`
  - `<=55` `#f59e0b`
  - `<=70` `#84cc16`
  - otherwise `#10b981`

### Hero Price Strip

- Outer card shared pattern with padding `32px`.
- Loading row flex, gap `32px`; skeletons `64px x 192px` and `40px x 128px`.
- Loaded layout: flex column mobile, row desktop; align center; justify between; gap `24px`.
- Label: `12px`, `#64748b`, uppercase, tracking widest, weight `700`, margin bottom `8px`.
- Price: `48px` mobile / `60px` desktop, weight `700`, white, mono.
- As-of: `14px`, `#64748b`.
- Session range block right side gap `32px`.
- Trend badge: padding `8px 16px`, rounded full, `16px`, weight `700`, border.
- Trend colors:
  - strong/uptrend chip `bg #10b9811a`, border `#10b98133`, text `#34d399`
  - mixed chip `bg #f59e0b1a`, border `#f59e0b33`, text `#fbbf24`
  - downtrend chip `bg #ef44441a`, border `#ef444433`, text `#f87171`

### Impact on Soybean Oil Futures

Outer card shared pattern with padding `32px`.

Header:

- Flex align center, justify between, margin bottom `24px`.
- Main section title uses amber left border.
- Subtitle: `12px`, `#64748b`, margin top `4px`, padding left `20px`.
- Score at right: `36px`, weight `700`, white, mono.

Nested blocks:

- Standard nested panel: margin bottom `24px`, border `rgba(255,255,255,0.05)`, radius `12px`, padding `16px`, background `rgba(255,255,255,0.02)`.
- Procurement panel: margin bottom `24px`, border `rgba(6,182,212,0.3)`, radius `12px`, padding `20px`, background `rgba(255,255,255,0.02)`.
- Nested metric grids: `2` columns mobile / `4` columns desktop, gap `16px`.
- Nested metric cards: background `rgba(255,255,255,0.02)`, radius `12px`, padding `16px`.
- Metric value: `24px`, weight `700`, white, mono.
- Metric label: `12px`, `#64748b`, uppercase.
- Narrative box: background `rgba(255,255,255,0.02)`, border `rgba(255,255,255,0.05)`, radius `12px`, padding `20px`.

### Market Snapshot

- Heading outside cards: `18px`, weight `700`, white, margin bottom `16px`, flex align center, gap `8px`.
- Metadata beside heading: `12px`, `#64748b`, weight normal, margin left `8px`.
- Snapshot grid: `1` column mobile, `2` columns small, `3` columns large, gap `24px`.
- Snapshot card: background `#0a0a0a`, border `white/10`, radius `12px`, padding `24px`, hover border `white/20`, transition colors.
- Snapshot label: `12px`, `#64748b`, uppercase, tracking widest, weight `700`, margin bottom `8px`.
- Snapshot value: `30px`, weight `700`, mono, white or signal color.
- Subtext: `12px`, `#64748b`, margin top `4px`.

Crude cross card:

- Margin top `24px`.
- Outer card `#0a0a0a`, border `white/10`, radius `16px`, padding `24px`, hover `white/20`.
- Header flex column mobile / row desktop, gap `12px`, margin bottom `20px`.
- Inner grid `1` column mobile / `3` columns desktop, gap `16px`, margin bottom `16px`.
- Body copy `14px`, `#cbd5e1`, line-height relaxed.

### Market Volatility

- Outer card shared pattern, padding `32px`.
- Grid `1` column mobile / `3` columns desktop, gap `24px`.
- Gauge block text center.
- Label `14px`, `#94a3b8`, weight `700`, margin bottom `8px`.
- Value `30px`, weight `700`, mono, white, margin bottom `8px`.
- Track height `10px`, `#1e293b`, rounded full, max width `200px`, margin auto, margin bottom `8px`.
- Bar color by status: elevated `#ef4444`, moderate `#f59e0b`, calm `#10b981`.
- Status text `14px`, weight `500`, status color.

### Market Participants

- Heading outside cards follows Market Snapshot heading pattern.
- Grid `1` column mobile / `3` columns desktop, gap `24px`, margin bottom `24px`.
- Participant card: background `#0a0a0a`, border `white/10`, radius `16px`, padding `24px`, hover `white/20`.
- Card title `16px`, weight `700`, white.
- Subtitle `12px`, `#64748b`.
- Net label `24px`, weight `700`, margin bottom `4px`, green if net > 0 else red.
- Contract count `18px`, mono, `#cbd5e1`, margin bottom `12px`.
- Long/short bar track height `12px`, `#1e293b`, rounded full, overflow hidden, margin bottom `8px`.
- Bar fill `#10b981`, rounded left full.
- Footer labels `14px`, `#94a3b8`, justify between.

Fund percentile bar:

- Background `#0a0a0a`, border `white/10`, radius `16px`, padding `24px`.
- Header flex, justify between, margin bottom `12px`.
- Track height `12px`, `#1e293b`, rounded full, overflow hidden, margin bottom `8px`.
- Fill gradient `#ef4444` -> `#f59e0b` -> `#10b981`.
- Footer `12px`, `#64748b`, justify between; center text `#94a3b8`.

### Headlines

- Heading follows Market Snapshot heading pattern.
- Sentiment summary bar: margin bottom `24px`, background `#0a0a0a`, border `white/10`, radius `12px`, padding `16px`.
- Summary stacked bar: flex gap `4px`, height `12px`, rounded full, overflow hidden, margin bottom `12px`.
- Bullish segment `#10b981`; neutral `#475569`; bearish `#ef4444`.
- Summary labels `14px`; bullish `#34d399`, neutral `#64748b`, bearish `#f87171`.
- Headline grid `1` column mobile / `2` columns desktop, gap `24px`.
- Headline card: background `#0a0a0a`, border `white/10`, radius `16px`, padding `24px`, hover `white/20`.
- Badge row flex, justify between, align start, margin bottom `12px`.
- Sentiment badge padding `4px 12px`, rounded full, `12px`, weight `700`, border.
- Bullish badge `rgba(16,185,129,0.1)`, text `#34d399`, border `rgba(16,185,129,0.2)`.
- Bearish badge `rgba(239,68,68,0.1)`, text `#f87171`, border `rgba(239,68,68,0.2)`.
- Neutral badge `rgba(100,116,139,0.1)`, text `#94a3b8`, border `rgba(100,116,139,0.2)`.
- Lane badge `rgba(6,182,212,0.1)`, text `#67e8f9`, border `rgba(6,182,212,0.2)`, padding `2px 8px`.
- Source text `14px`, `#64748b`; time `12px`, `#475569`, mono.
- Headline title `16px`, weight `700`, white, margin bottom `8px`, tight line height.
- Summary `14px`, `#94a3b8`, margin bottom `12px`, line height relaxed, clamp 3 lines.
- Tag chips padding `2px 8px`, rounded, background `rgba(255,255,255,0.05)`, `12px`, `#94a3b8`, mono, border `rgba(255,255,255,0.05)`.

## Required Phone Behavior

V15 has a `max-width: 480px` block that V16 currently lacks.

For this scope, preserve the current V16 top nav/header behavior, but restore equivalent body behavior for the page bodies:

- Vegas segment grid: `2` columns, gap `8px`.
- Vegas event row: column, align stretch, gap `8px`.
- Vegas event stats: wrap, gap `8px`.
- Vegas opportunity row: column, align stretch, gap `8px`.
- Generic stacked grids should collapse to one column where V15 does so.

## Glide Operational Data Contract

### Read-Only Rule

Glide is production CRM. V15 treats it as read-only. V16 must preserve that boundary.

Allowed direction:

`Glide API -> V16/Supabase staging/serving tables -> API route -> Vegas Intel page`

Disallowed:

- No writes back to Glide.
- No browser-exposed Glide token.
- No public unauthenticated sync endpoint.
- No silent table creation from sync code.
- No fake rows when Glide data is missing.

### API Endpoint and Secret

Endpoint:

- `https://api.glideapp.io/api/function/queryTables`

Auth:

- Bearer token from `GLIDE_BEARER_TOKEN`.
- Do not put the token in client code.
- Do not commit or paste the token into this repository.

Payload shape:

- JSON body contains `appID`.
- JSON body contains `queries: [{ tableName: <native-table-id>, utc: true }]`.
- Response rows are expected at `responseJson[0].rows`.

### App ID Drift Probe Result

V15 contains two different Glide app IDs:

| V15 Path | App ID |
|---|---|
| Python ingestion `src/fusion/ingestion/glide_vegas.py` | `6262JQJdNjhra79M25e4` |
| TS sync route `frontend/src/app/api/vegas/sync/route.ts` | `6nvONp42nj5tLQmMcqF3` |

Read-only probe run on 2026-05-18 using `GLIDE_BEARER_TOKEN` from V15 `frontend/.env.production` without printing the token:

| Table | Python App `6262JQJdNjhra79M25e4` Rows | TS App `6nvONp42nj5tLQmMcqF3` Rows | Decision |
|---|---:|---:|---|
| restaurants | 151 | 151 | both valid |
| casinos | 31 | 31 | both valid |
| fryers | 421 | 421 | both valid |
| export_list | 3176 | 3007 | Python app has more rows |
| scheduled_reports | 28 | 26 | Python app has more rows |
| shifts | 148 | 126 | Python app has more rows |
| shift_casinos | 440 | 411 | Python app has more rows |
| shift_restaurants | 1233 | 1165 | Python app has more rows |

Kirk decision: use the larger, more robust 8-table Python app ID `6262JQJdNjhra79M25e4` as the V16 canonical Glide source. The TS app ID also works, but it returns fewer rows for the shift/export/report areas, so it is not the selected source for V16.

Implementation still must re-run a read-only probe immediately before live sync work because Glide is an external production system and table/app access can drift.

### V15 Glide Source Groups

The durable V15 Python source pulls 8 raw tables. For product planning, treat them as 6 operational groups:

| Operational Group | Raw Table Key(s) | Glide Native Table ID | V16 Purpose |
|---|---|---|---|
| Restaurant accounts | `restaurants` | `native-table-ojIjQjDcDAEOpdtZG5Ao` | Account names, casino relation, oil product, service cadence, contacts, account status |
| Casino/property lookup | `casinos` | `native-table-Gy2xHsC7urEttrz80hS7` | Casino/property display names, address/property attributes, restaurant joins |
| Fryer inventory | `fryers` | `native-table-r2BIqSLhezVbOKGeRJj8` | Fryer count/capacity per restaurant, operational intensity |
| Export/customer list | `export_list` | `native-table-PLujVF4tbbiIi9fzrWg8` | Customer/export list coverage and downstream account list support |
| Scheduled reports / maintenance cadence | `scheduled_reports` | `native-table-pF4uWe5mpzoeGZbDQhPK` | Weekly maintenance/report cadence and field-service intelligence |
| Shift/service schedule graph | `shifts`, `shift_casinos`, `shift_restaurants` | `native-table-K53E3SQsgOUB4wdCJdAN`, `native-table-G7cMiuqRgWPhS0ICRRyy`, `native-table-QgzI2S9pWL584rkOhWBA` | Service routing, shift links to casinos/restaurants, schedule-sensitive sales/service planning |

The V15 TS sync route only includes 5 raw tables: restaurants, casinos, fryers, export_list, shifts. It omits scheduled_reports, shift_casinos, and shift_restaurants. Use the Python 8-table inventory as the more complete extraction map, with the 2026-05-18 read-only probe as current evidence. Re-run the probe before implementation because external access can drift.

### Critical Glide Field IDs

Restaurants table `native-table-ojIjQjDcDAEOpdtZG5Ao`:

| Semantic Field | Glide Field ID | Notes |
|---|---|---|
| Restaurant/account name | `MHXYO` | V15 fallback also checks `Name` |
| Casino link | `2Ca0T` | Joins to casinos by casino `glide_row_id` |
| Technician link | `g5WAm` | Assignment context |
| Oil type | `U0Jf2` | Example values: StableMAX - Bulk, SoyMAX - 35# Jib |
| Oil form | `0RcWz` | Product/package form |
| TPM threshold | `zPYNY` | Quality/maintenance threshold |
| Status | `s8tNr` | V15 uses for account status |
| Active flag | `lA5EU` | Activity state |
| Replacement agreement | `g9zbE` | Commercial/service context |
| Schedule parameters | `Po4Zg` | Daily, certain days, etc. |
| Days | `lf0gF` | Comma-separated day list |
| Primary contact name | `doeXs` | Contact display |
| Primary contact email | `a3ffP` | Contact email |
| Secondary contact name | `Ie35Z` | Often chef name |
| Secondary contact email | `maCR5` | Secondary email |
| Assignment string | `h90Ts` | Route/assignment context |
| Assignment override tech JSON | `Xz5zq` | Override context |
| Assignment override day | `k4SLM` | Override day |
| Assignment override clear date | `uwU2A` | Override expiration |
| Long-term assignment exclusion | `Ny3eQ` | Workflow exclusion |
| Notes | `08Hj9` | Freeform notes |
| Group ID stamped | `cDEde` | Grouping context |

Casinos table `native-table-Gy2xHsC7urEttrz80hS7`:

| Semantic Field | Glide Field ID |
|---|---|
| Name | `Name` |
| Address | `L9K9x` |
| Oil type | `UYUGq` |
| Technician link | `ro9f5` |

Fryers table `native-table-r2BIqSLhezVbOKGeRJj8`:

| Semantic Field | Glide Field ID |
|---|---|
| Name | `Name` |
| Restaurant link | `2uBBn` |
| Capacity in lbs | `xhrM0` |

Drift checks:

- Required restaurant fields: `MHXYO`, `2Ca0T`, `Po4Zg`.
- Required casino fields: `Name`.
- Required fryer fields: `2uBBn`.
- If a required key is absent in non-empty rows, fail closed and update the field map after a verified Glide schema check.

### V15 Storage Pattern

V15 stores Glide pulls as raw JSONB rows:

- `glide_row_id`
- `data` JSONB payload
- `ingested_at`

The original migration created those tables under `ops.vegas_*`, and later runtime/API logic targets `vegas.vegas_*`. This was previously drift-prone. V16 should not repeat that split.

V16 has consolidated tables:

- `vegas.restaurants`
- `vegas.casinos`
- `vegas.events`
- `vegas.venues`
- `vegas.fryers`
- `vegas.customer_scores`
- `vegas.event_impact`

Current V16 tables do not preserve the V15 raw Glide row contract for every Glide source. To support the requested body UI and real operational detail, V16 needs one of these approved patterns:

1. Add raw Glide staging tables in `vegas` or `ops` with strict source ownership, then promote into existing consolidated serving tables.
2. Add explicit columns plus `metadata` fields to consolidated `vegas.*` tables and store `glide_row_id`/raw payload in metadata.

Recommended for safety:

- Raw source landing: `ops.glide_vegas_*` or `vegas.glide_*` with `glide_row_id`, `data`, `source_table_id`, `synced_at`.
- Serving tables: existing `vegas.*` tables used by `/api/vegas/intel`.
- Promotion layer: deterministic SQL/Python mapping from raw rows into serving columns.

Do not run migrations without Kirk approval.

### V16 API Output Needed for the Vegas Body

To render the V15-style Vegas body, `/api/vegas/intel` or companion routes need these payloads:

Stats:

- `restaurants`
- `casinos`
- `fryers`
- `export_list`
- `shifts`
- `scheduled_reports`
- `last_sync`

Restaurants/opportunities:

- `id`
- `glide_row_id`
- `name`
- `casino`
- `contact_person`
- `service_frequency`
- `oil_type`
- `status`
- `fryer_count`
- `total_capacity_lbs`
- raw `data` or metadata pointer for detail drill-in

Events:

- `id`
- `name`
- `category`
- `venue`
- `attendance`
- `startDate`
- `endDate`
- `daysUntil`
- `color`

Fryers:

- restaurant relation
- fryer count
- total capacity lbs
- raw telemetry present/missing state

Shift/scheduled-report context:

- enough fields to answer Kevin's weekly maintenance/service-cadence questions without pretending unknown values are populated.

### Data Freshness Reality

V15 Glide is not true live websocket data. It is a read-only full-refresh pull from Glide into Postgres, then page APIs read Postgres. It can be near-real-time only to the cadence of the sync trigger.

V16 current plan says daily pg_cron into `vegas.*`. If Kirk wants "real time" in the UI, define the freshness target explicitly before implementation:

- daily scheduled pull
- manual refresh trigger
- hourly pull during business hours
- webhook/edge path

Until that is decided, label it "Glide-synced operational data", not real-time.

## V16 Implementation Checklist For Next Agent

1. Read this file, `AGENTS.md`, `docs/MASTER_PLAN.md`, `docs/agent-safety-gates.md`, and `docs/contracts/page-surface.md`.
2. Verify current `git status --short`.
3. Do not touch V16 top nav or top page headers unless Kirk explicitly asks.
4. Rebuild Vegas body from the visual contract above.
5. Rebuild Sentiment body from the visual contract above.
6. Do not copy V15 source code. Translate tokens/layouts into fresh V16 components.
7. Add/restore Vegas phone body behavior for max-width `480px`.
8. Before Glide implementation, re-run the 8-table read-only probe and confirm the Python app ID still returns all 8 tables.
9. Do not expose `GLIDE_BEARER_TOKEN`.
10. Do not call Glide from the browser.
11. Do not create a public unauthenticated sync route.
12. Do not fake restaurant, fryer, oil-type, schedule, or shift values. Empty/missing state must be explicit.
13. Preserve the Vegas behavior layer: segment filtering, event sorting, opportunity classification, ZFusion/event pressure scoring, cuisine-aware pitch reasoning, and AI-card provenance.
14. If wiring `Intel` buttons, create draft server-side pitch/intel output from verified data only; do not imply V15 had a completed button workflow.
15. If schema/migration is needed, stop and get Kirk approval before running it.
16. Verify with lint/build and browser screenshot parity once implementation starts.

## Acceptance Criteria

Visual:

- Vegas body has segment cards, event rows, countdown circles, and opportunity rows with the exact colors, spacing, borders, and responsive behavior listed here.
- Sentiment body has all seven V15 sections in the listed order and uses the exact card hierarchy, gauges, badges, bars, and headline styling listed here.
- V16 headers remain unchanged unless explicitly reopened.
- No page is narrowed into a centered container.

Glide/data:

- A V16 agent can identify every Glide table source needed for restaurant, casino, fryer, export list, scheduled report, and shift-service context.
- The larger 8-table Python app ID is used as the canonical V16 Glide source.
- V16 API output supports `oil_type`, `service_frequency`, contact, casino, fryer count, and capacity fields.
- Missing Glide data is surfaced as missing, not represented by placeholders.
- All Glide sync remains read-only and server-side.

Logic:

- Events are sourced from verified event rows, filtered to active future dates, sorted for display by soonest upcoming date, and colored by the category map above.
- Opportunity rows classify customers/prospects from actual service-cadence data, not from hardcoded account lists.
- ZFusion or successor opportunity scoring includes expected spend, cuisine affinity, event pressure/attendance signal, and evidence-backed reasoning.
- Pitch/intel output references real oil type, fryer capacity, service cadence, event timing, cuisine affinity, and provenance, or explicitly states what is missing.
- The `Intel` button is not treated as already complete in V15; any V16 workflow must be intentionally implemented server-side as draft collateral.

Verification:

- `npm run lint` PASS.
- `npm run build` PASS.
- Relevant guard command PASS if source implementation changes are made.
- Browser visual check against V15 reference for desktop and phone widths.
