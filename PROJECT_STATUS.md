# Prizen Project Status

Last updated: July 18, 2026

## Product

Prizen is a React Native / Expo app that helps users discover giveaways, free games,
grants, competitions, tenders, product launches, curated feed items, and community
opportunities in one clean mobile feed.

The current product direction is English-first, with `prizen.app` as the public web
domain and `support@prizen.app` as the support contact.

## Current Readiness

- Private beta / MVP readiness: approximately 70-75%.
- Public Google Play launch readiness: approximately 50-60%.
- The app is functional and has real data, but still needs production build hardening,
  store assets, Play Store forms, and real-device QA before launch.

## Main App State

- Expo SDK: `~56.0.16`
- React Native: `0.85.3`
- App name: `Prizen`
- Expo slug: `opportunity-radar`
- Scheme: `prizen`
- Version: `1.0.0`
- Current Android package: `com.mikekent1.opportunityradar`
- EAS project ID is configured in `app.json`.
- The app uses a development client through `expo-dev-client`.

Before the first Google Play production build, decide whether to keep the current
Android package or change it to a final Prizen package such as:

- `com.prizen.app`
- `app.prizen.mobile`

## Website

The official website is live:

- `https://prizen.app`
- `https://www.prizen.app`
- Vercel fallback URL: `https://prizen-three.vercel.app`

The site source is in `site/` and includes:

- Landing page
- Privacy Policy: `https://prizen.app/privacy`
- Terms of Service: `https://prizen.app/terms`
- Support: `https://prizen.app/support`
- Delete Account: `https://prizen.app/delete-account`

Vercel is configured with:

- Root directory: `site`
- Framework preset: `Other`
- Static HTML/CSS deployment
- `site/vercel.json` with clean URLs and basic security headers

The site hero logo was updated to use the transparent Prizen mark plus CSS-rendered
text, avoiding the old white-background logo image.

## Authentication And Account Features

- The app is gated behind Google sign-in using Supabase Auth and Expo Auth Session.
- Users can sign in and sign out.
- Profile modal shows account information.
- Saved opportunities are supported through the `saved_opportunities` table.
- Users can save and unsave opportunities.
- The Saved tab shows saved items.
- Profile/settings now links to:
  - Privacy Policy
  - Terms of Service
  - Support
  - Delete account

## App UI

The app UI is now English-first.

Current main tab order:

1. Giveaways
2. Free to Play
3. Competitions
4. Grants
5. Tenders
6. Launches
7. Feeds
8. Community
9. Saved
10. All

The home header shows centered Prizen branding and the tagline:

```txt
Find your next opportunity.
```

The search field is hidden by default and opens from the header search button.

The old stat cards were removed. Counts now live as badges on the tabs.

The feed uses incremental rendering:

- Initial visible opportunities: 15
- `Load more` adds 15 more

This was added to improve responsiveness when switching tabs and subcategories.

## Category And Subcategory Logic

Giveaway subcategories:

1. Cash
2. Trips
3. Gift cards
4. Hardware
5. Games
6. Software
7. In-game
8. DLC
9. Other
10. All

Giveaways default to `Cash`.

Other categories also have subfilters:

- Free to Play: MMORPG, Shooter, Strategy, Card Games, MOBA, Battle Royale, Sports, Browser, All
- Competitions: Cash Prize, Featured, Getting Started, Knowledge, Playground, Swag, All
- Grants: High Value, Health, Social Services, Research, Education, Business, Environment, EU Grants, All
- Tenders: High Value, Closing Soon, Norway, Sweden, Netherlands, Finland, France, All
- Launches: AI, Productivity, Developer Tools, SaaS, Writing, Games, Social, All

Cash giveaways are sorted by known amount first, then higher amount, then earlier
deadline, then newer publication date.

## Data Sources

The app imports or displays opportunities from:

- GamerPower
- Epic Games Store
- FreeToGame
- CheapShark
- Grants.gov / Simpler Grants
- EU Funding & Tenders / SEDIA
- TED
- Product Hunt
- Kaggle
- Curated RSS feeds
- Reddit curated subreddits
- Instagram social monitoring through Apify
- Sweepstakes web sources

The scheduled sync is resilient and runs providers independently through:

```bash
npm run scheduled:sync
```

Strict mode is available:

```bash
npm run scheduled:sync:strict
```

## Data Quality And Maintenance

Important maintenance scripts:

```bash
npm run expired:cleanup
npm run pipeline:health
npm run rewards:audit
npm run rewards:backfill
npm run giveaways:enrich
```

Recent data quality work:

- Expired active opportunities cleanup is available and has been run.
- Reward categorization audit was added.
- AI-assisted reward classification was added for ambiguous web/social giveaways.
  - Rules still run first for speed and predictable high-confidence cases.
  - If `OPENAI_API_KEY` is configured, ambiguous rewards can be classified by AI.
  - The pipeline stores `classification_method`, `classification_confidence`,
    `classification_reason`, and `needs_review` on opportunities.
- AI-assisted giveaway enrichment was added for web/social giveaways.
  - The pipeline can store `clean_summary`, `prize_description`, `eligibility`,
    `quality_score`, `risk_flags`, `quality_notes`, `enrichment_method`, and
    `enrichment_reason`.
  - `risk_flags` are reserved for serious uncertainty or user-facing risk.
  - `quality_notes` track normal listing limitations such as missing rules,
    vague deadlines, unstated eligibility, or unclear prize value.
  - The mobile app prefers `clean_summary` in cards and details when available.
  - Detail pages show `Prize` and `Eligibility` sections when AI extracted them.
- Reward backfill now cleans stale generated reward tags for web/social imports.
- The classifier no longer lets old `subcategory` values bias new classification.
- Travel/gift-card/cash edge cases were tightened.
- Example fixed cases:
  - `Win a luxury trip to Vietnam` -> Trips
  - `Win a luxury escape in Southern California, USA` -> Trips
  - `Road Trip Sweepstakes + Visa Gift Card` -> Gift Cards
  - `Summer Travel + Venmo` -> Cash

Latest checked results:

```txt
npx tsc --noEmit -> passed
npx expo-doctor -> 21/21 passed
npm run rewards:audit -> 458 audited, 0 high flagged, 5 medium review candidates
npm run giveaways:enrich -> 81 active giveaways enriched with AI so far
AI enrichment tuning -> avg quality 0.73, 17/81 with risk flags, 72/81 with quality notes
npm run pipeline:health -> expiredActive: 0
```

The latest pipeline health check reported active opportunity coverage across the
major sources, including GamerPower, Epic Games, FreeToGame, Grants, TED, Product
Hunt, Kaggle, RSS, and Sweepstakes Web.

## Supabase

Supabase is used for:

- Opportunities
- Saved opportunities
- Auth
- Realtime updates
- Edge Function sync support
- Service-role script imports for scheduled providers

Useful commands:

```bash
npm run db:check
npm run db:push
npm run functions:deploy
```

The app reads only public Supabase variables through `EXPO_PUBLIC_*`.
Server-side secrets are used by scripts, GitHub Actions, Supabase secrets, or local
`.env` during maintenance.

Optional AI classifier secrets:

```bash
OPENAI_API_KEY=...
OPENAI_CLASSIFIER_MODEL=gpt-5.4-mini
AI_REWARD_CLASSIFIER_ENABLED=true
AI_REWARD_CLASSIFIER_MODE=uncertain
OPENAI_ENRICHMENT_MODEL=gpt-5.4-mini
AI_GIVEAWAY_ENRICHMENT_ENABLED=true
AI_ENRICHMENT_BACKFILL_LIMIT=80
```

## GitHub / Deployment

Recent important commits:

- `bd1bfd7` - Expand Play Store launch checklist
- `5143718` - Prepare Prizen app for launch readiness
- `eab2158` - Fix Prizen site hero logo transparency
- `91cdc99` - Add Prizen marketing site

The Vercel project deploys from the GitHub repo using the `site/` root directory.

## Files To Know

- `App.tsx` - main app UI and app behavior
- `src/components/OpportunityCard.tsx` - opportunity card
- `src/services/opportunities.ts` - opportunity queries, counts, saved items
- `src/services/auth.ts` - Google sign-in and sign-out
- `src/utils/displayText.ts` - display text cleanup
- `scripts/lib/reward-classifier.mjs` - giveaway reward classifier
- `scripts/lib/ai-reward-classifier.mjs` - optional AI-assisted reward classifier
- `scripts/lib/ai-giveaway-enrichment.mjs` - optional AI-assisted giveaway enrichment
- `scripts/audit-giveaway-categorization.mjs` - reward categorization audit
- `scripts/close-expired-opportunities.mjs` - closes expired active opportunities
- `scripts/pipeline-health.mjs` - source and data health summary
- `scripts/sync-all.mjs` - resilient scheduled sync runner
- `site/` - public Prizen website
- `LAUNCH_CHECKLIST.md` - Play Store and launch checklist

## Remaining Launch Work

The next phase is Google Play launch preparation:

1. Decide the final Android package name.
2. Set release versioning, including Android `versionCode`.
3. Build a production Android App Bundle with EAS.
4. Test the production build on a real Android device.
5. Prepare Play Store listing copy.
6. Prepare Play Store screenshots.
7. Complete Google Play content rating and data safety forms.
8. Publish first to internal or closed testing.
9. Fix any tester feedback before production release.

See `LAUNCH_CHECKLIST.md` for the detailed checklist.
