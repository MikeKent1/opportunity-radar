# Prizen Launch Checklist

## Later Implementation

1. Build and test a production Android release on a real device.
2. Add Privacy Policy, Terms, account deletion, and support contact flows.
3. Create and run a QA checklist with the main user journeys.
4. Check crash/performance behavior after sustained real-device use.
5. Clean project documentation and decide the final app package/name strategy.
6. Prepare store assets, screenshots, short description, and launch copy.

## Google Play Store Readiness

1. Decide final Android package name before the first production store build.
   - Current package: `com.mikekent1.opportunityradar`
   - Candidate: `com.prizen.app`
   - Candidate: `app.prizen.mobile`
2. Confirm app versioning for release.
   - `version`: `1.0.0`
   - `android.versionCode`: `1`
3. Create a production Android App Bundle with EAS.
   - Command: `npx eas-cli build --platform android --profile production`
   - Expected artifact: `.aab`
4. Test the production build on a real Android device before store submission.
5. Create or use a Google Play Developer account.
6. Create the Google Play app listing.
   - App name: `Prizen`
   - Privacy Policy: `https://prizen.app/privacy`
   - Support URL: `https://prizen.app/support`
   - Account deletion URL: `https://prizen.app/delete-account`
7. Prepare Google Play listing copy.
   - Short description
   - Full description
   - App category
   - Contact email: `support@prizen.app`
8. Prepare screenshots.
   - Login screen
   - Main feed
   - Giveaway subcategories
   - Opportunity detail
   - Saved/profile screen
9. Complete Google Play questionnaires.
   - Content rating
   - Data safety
   - Ads declaration
   - App access instructions, if reviewers need login
10. Publish first to an internal or closed testing track before production.

## Real-Device QA Checklist

1. Google sign in works.
2. Sign out returns to the login screen.
3. Main tabs switch quickly.
4. Subcategory tabs switch quickly.
5. `Load more` works and does not freeze the feed.
6. Saved opportunities can be added and removed.
7. Saved tab shows the correct saved items.
8. Opportunity detail modal opens and closes.
9. External opportunity links open correctly.
10. Profile legal/support links open correctly.
11. Pull-to-refresh does not crash.
12. App behaves acceptably on slow network.
13. App remains stable after 10-15 minutes of use.
