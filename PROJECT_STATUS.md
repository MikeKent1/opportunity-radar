# Opportunity Radar — Κατάσταση Project

Τελευταία ενημέρωση: 26 Ιουνίου 2026

## Τι είναι το app

React Native / Expo εφαρμογή που συγκεντρώνει ενεργά gaming giveaways και
ευκαιρίες χρηματοδότησης σε ένα ενιαίο feed.

## Τεχνολογίες

- React Native, Expo και TypeScript
- Supabase Database, Realtime και Edge Functions
- GitHub Actions για database migrations όταν ο CLI λογαριασμός έχει περιορισμένα privileges
- GamerPower API
- Epic Games Store promotions endpoint
- FreeToGame API
- CheapShark API
- EU Funding & Tenders / SEDIA Search API
- TED Search API
- Product Hunt API v2 / GraphQL
- Kaggle CLI / Public API
- Curated RSS / Atom feeds
- Reddit OAuth API για curated subreddits
- Simpler.Grants.gov API adapter
- GitHub Actions για scheduled EU/TED sync
- EAS / Expo development build setup

## Τι έχει υλοποιηθεί

- Responsive dark-themed UI στα ελληνικά
- Λίστα ευκαιριών με αναζήτηση και φίλτρα
- Κάρτες με τίτλο, περιγραφή, αξία, deadline, tags, εικόνα και εξωτερικό link
- Pull-to-refresh και κουμπί χειροκίνητου συγχρονισμού
- Αυτόματος συγχρονισμός κατά την εκκίνηση
- Realtime ενημέρωση όταν αλλάζουν εγγραφές στο Supabase
- Demo δεδομένα ως fallback
- Ημερήσιος αυτόματος συγχρονισμός για EU Funding & Tenders και TED
- Scheduled συγχρονισμός Product Hunt launches μέσω GitHub Actions
- Scheduled συγχρονισμός Kaggle competitions μέσω GitHub Actions
- Scheduled συγχρονισμός curated RSS feeds μέσω GitHub Actions
- Scheduled συγχρονισμός curated Reddit subreddits μέσω GitHub Actions
- Προετοιμασία Android development build για δοκιμή σε κινητό χωρίς Expo Go

## Supabase

- Το project είναι συνδεδεμένο μέσω Supabase CLI
- Οι αλλαγές της βάσης εκτελούνται πλέον με migrations, χωρίς SQL Editor
- Δημιουργήθηκε ο πίνακας `opportunities`
- Προστέθηκαν indexes, RLS policy, Realtime και trigger για `updated_at`
- Η Edge Function `sync-opportunities` είναι deployed
- Τα migrations είναι ενημερωμένα με την απομακρυσμένη βάση
- Προστέθηκε manual GitHub Actions workflow `Apply DB migrations` για εφαρμογή
  migrations μέσω direct database password, χωρίς Supabase Management API
- Το GitHub Actions runner δεν υποστηρίζει IPv6 direct DB connection, άρα το
  migration workflow υποστηρίζει πλέον `SUPABASE_DB_URL` με IPv4 Transaction
  Pooler connection string από Supabase

Χρήσιμες εντολές:

```bash
npm run db:check
npm run db:push
npm run functions:deploy
```

## GamerPower

- Χρησιμοποιείται το δημόσιο endpoint ενεργών giveaways
- Δεν απαιτεί API key
- Η JSON απόκριση μετατρέπεται στο κοινό format του πίνακα `opportunities`
- Αποθηκεύονται εικόνες, αξία, πλατφόρμες, τύπος, deadline και URL
- Η πηγή επιστρέφει 91 giveaways· 89 εμφανίζονται μετά το deduplication
- Τα links ανοίγουν μέσω GamerPower για το απαιτούμενο attribution

## Epic Games Store

- Προστέθηκε adapter για τα ενεργά εβδομαδιαία δωρεάν παιχνίδια
- Δεν απαιτείται API key ή συνδρομή
- Αποθηκεύονται τίτλος, publisher, εικόνα, αρχική αξία και ημερομηνία λήξης
- Εμφανίζονται στο υπάρχον φίλτρο `Giveaways`
- Το endpoint είναι undocumented, γι’ αυτό ο parser παραμένει στην Edge Function
- Αυτή τη στιγμή εμφανίζονται 2 ενεργές Epic Games προσφορές

## FreeToGame

- Προστέθηκε δημόσιο API χωρίς API key ή συνδρομή
- Τα μόνιμα δωρεάν παιχνίδια εμφανίζονται σε ξεχωριστό `Free to Play` tab
- Αποθηκεύονται εικόνα, publisher, genre, platform και release date
- Η λίστα διαχωρίζεται από τα προσωρινά giveaways
- Αυτή τη στιγμή έχουν εισαχθεί 413 παιχνίδια

## CheapShark

- Προστέθηκε δημόσιο API χωρίς API key ή συνδρομή
- Εισάγονται μόνο deals με τελική τιμή `0`
- Ανακτώνται store, αρχική αξία, εικόνα και CheapShark redirect link
- Χρησιμοποιούνται περιορισμένα requests και attribution μέσω CheapShark
- Η τρέχουσα μοναδική προσφορά είναι duplicate και κρύβεται σωστά

## Deduplication

- Εκτελείται αυτόματα μετά από κάθε συγχρονισμό
- Συγκρίνονται κανονικοποιημένοι τίτλοι από τις giveaway πηγές
- Η προτεραιότητα είναι Epic Games → GamerPower → CheapShark
- Οι διπλότυπες εγγραφές διατηρούνται στη βάση ως `closed`, αλλά δεν εμφανίζονται

## Grants

- Υπάρχει έτοιμος adapter για το Simpler.Grants.gov API
- Το `GRANTS_API_KEY` έχει αποθηκευτεί με ασφάλεια ως Supabase secret
- Η πραγματική σύνδεση API έχει επιβεβαιωθεί επιτυχώς
- Εισάγονται ενεργά grants με agency, περιγραφή, ποσό όπου υπάρχει και deadline
- Οι εγγραφές επισημαίνονται ως `US Grant`

## EU Funding & Tenders

- Προστέθηκε το δημόσιο SEDIA Search API της Ευρωπαϊκής Επιτροπής
- Δεν απαιτείται προσωπικό API key ή συνδρομή
- Ανακτώνται ενεργές και επερχόμενες ευρωπαϊκές χρηματοδοτήσεις
- Εμφανίζονται στο tab `Grants` με ένδειξη `EU Grant`
- Υποστηρίζονται πρόγραμμα, περιγραφή, deadline, action type και ποσό όπου υπάρχει
- Το migration και ο adapter έχουν γίνει deploy
- Λόγω ασυμβατότητας multipart μεταξύ SEDIA και Edge Runtime, ο συγχρονισμός
  εκτελείται από το controlled script `npm run eu:sync`
- Έχουν εισαχθεί 66 ενεργές ή επερχόμενες ευρωπαϊκές ευκαιρίες

## TED Tenders

- Προστέθηκε το επίσημο TED Search API χωρίς API key ή συνδρομή
- Οι δημόσιοι διαγωνισμοί εμφανίζονται σε ξεχωριστό tab `Tenders`
- Εισάγονται πρόσφατες προκηρύξεις με μελλοντικό deadline
- Υποστηρίζονται buyer, χώρα, CPV, περιγραφή και εκτιμώμενη αξία όπου υπάρχει
- Ο συγχρονισμός εκτελείται από το controlled script `npm run ted:sync`
- Έχουν εισαχθεί 5 πρόσφατοι ενεργοί διαγωνισμοί με μελλοντικό deadline

## Αυτόματος συγχρονισμός EU/TED

- Προστέθηκε GitHub Actions workflow στο `.github/workflows/sync-eu-ted.yml`
- Το workflow τρέχει καθημερινά στις 05:17 UTC και υποστηρίζει manual run
- Εκτελεί το `npm run eu-ted:sync`, δηλαδή EU Funding και μετά TED
- Τα scripts μπορούν πλέον να τρέχουν και χωρίς τοπικό `.env`, διαβάζοντας
  ρυθμίσεις από environment variables / GitHub Secrets
- Αν δεν δοθεί σταθερό `EU_INGEST_TOKEN`, τα scripts δημιουργούν νέο token και
  το αποθηκεύουν στα Supabase Edge Function secrets πριν από το ingest
- Το local test έδειξε ότι ο τρέχων Supabase CLI λογαριασμός δεν έχει δικαίωμα
  αλλαγής secrets, άρα στο GitHub Actions χρειάζεται είτε owner/admin
  `SUPABASE_ACCESS_TOKEN` είτε κοινό σταθερό `EU_INGEST_TOKEN`
- Διορθώθηκε το handling των optional GitHub secrets ώστε άδειες τιμές να
  αγνοούνται και να ενεργοποιείται σωστά η αυτόματη δημιουργία ingest token
- Προστέθηκε πιο σταθερό path για GitHub Actions με `SUPABASE_SERVICE_ROLE_KEY`,
  ώστε το EU/TED ingest να γίνεται απευθείας στον πίνακα `opportunities` από τα
  scripts και να μη χρειάζεται αλλαγή Supabase secrets από CLI
- Το deploy της Edge Function από τον τρέχοντα CLI λογαριασμό μπλοκάρεται από
  Supabase permissions, οπότε το scheduled EU/TED sync δεν βασίζεται πλέον σε
  νέο Edge Function deploy

## Product Hunt

- Προστέθηκε νέα πηγή `producthunt` για πρόσφατα product/startup launches
- Η εφαρμογή έχει νέο φίλτρο `Launches`
- Το Product Hunt API v2 χρησιμοποιείται με GraphQL και credentials από GitHub
  Secrets
- Το scheduled workflow τρέχει πλέον `npm run scheduled:sync`, δηλαδή EU
  Funding, TED και Product Hunt
- Τα Product Hunt launches αποθηκεύονται απευθείας στη Supabase μέσω
  `SUPABASE_SERVICE_ROLE_KEY`, χωρίς να εκτίθενται API keys στο mobile app
- Η migration `20260626120000_add_producthunt_source.sql` εφαρμόστηκε στη remote
  βάση και έχουν εισαχθεί Product Hunt launches

## Kaggle

- Προστέθηκε νέα πηγή `kaggle` για competitions
- Η εφαρμογή έχει νέο φίλτρο `Competitions`
- Ο συγχρονισμός χρησιμοποιεί το επίσημο Kaggle CLI με `KAGGLE_API_TOKEN`
- Το GitHub Actions workflow εγκαθιστά Python και το package `kaggle`
- Τα competitions αποθηκεύονται απευθείας στη Supabase μέσω
  `SUPABASE_SERVICE_ROLE_KEY`
- Εκκρεμεί να εφαρμοστεί η migration `20260626130000_add_kaggle_source.sql`
  στη remote βάση πριν τρέξει επιτυχώς το Kaggle import
- Μετά το πρώτο import διορθώθηκε ο Kaggle parser ώστε να παράγει καθαρούς
  τίτλους από το competition slug, σωστά URLs και ποσά από reward strings

## Curated RSS feeds

- Προστέθηκε νέα πηγή `rss` για επιλεγμένα RSS/Atom feeds
- Η εφαρμογή έχει νέο φίλτρο `Feeds`
- Ο συγχρονισμός διαβάζει URLs από το GitHub secret `RSS_FEED_URLS`
- Υποστηρίζεται optional keyword filtering μέσω `RSS_KEYWORDS`
- Το keyword filtering εφαρμόζεται μόνο όταν υπάρχει `RSS_KEYWORDS`, επειδή οι
  ίδιες οι RSS πηγές είναι ήδη curated
- Τα feed items αποθηκεύονται απευθείας στη Supabase μέσω
  `SUPABASE_SERVICE_ROLE_KEY`
- Αν δεν υπάρχει `RSS_FEED_URLS`, το script ολοκληρώνεται χωρίς error και
  εισάγει 0 εγγραφές
- Εκκρεμεί να εφαρμοστεί η migration `20260626140000_add_rss_source.sql`
  στη remote βάση πριν τρέξει επιτυχώς το RSS import
- Μετά το πρώτο import διορθώθηκε ο RSS parser για nested Atom/RSS πεδία που
  επιστρέφουν arrays με `{ text }`

## Reddit curated subreddits

- Προστέθηκε νέα πηγή `reddit` για posts από curated subreddits
- Η εφαρμογή έχει νέο φίλτρο `Community`
- Ο συγχρονισμός χρησιμοποιεί Reddit OAuth client credentials
- Τα subreddits ρυθμίζονται με το GitHub secret `REDDIT_SUBREDDITS`
- Υποστηρίζονται optional `REDDIT_KEYWORDS` και `REDDIT_MIN_SCORE` για μείωση
  spam/noise
- Αν λείπουν Reddit credentials ή subreddits, το script ολοκληρώνεται χωρίς
  error και εισάγει 0 εγγραφές
- Εκκρεμεί να εφαρμοστεί η migration `20260626150000_add_reddit_source.sql`
  στη remote βάση πριν τρέξει επιτυχώς το Reddit import

## Resilient scheduled sync

- Προστέθηκε ενιαίο script `scripts/sync-all.mjs`
- Το `npm run scheduled:sync` δεν είναι πλέον αλυσίδα `&&`, αλλά runner που
  εκτελεί κάθε provider ξεχωριστά
- Το GitHub Actions summary δείχνει status, imported count, duration και notes
  ανά provider
- Το resilient summary περιλαμβάνει πλέον και τις Edge Function πηγές:
  GamerPower, Epic Games, FreeToGame, CheapShark και Grants.gov
- Οι Edge Function providers έχουν retry wrapper και καθαρό JSON error output,
  ώστε transient Supabase invocation failures να ξαναδοκιμάζονται και να
  εμφανίζουν χρήσιμη αιτία στο summary
- Στο default resilient mode το workflow αποτυγχάνει μόνο αν αποτύχουν όλοι οι
  providers
- Τα logs κάνουν redaction σε γνωστά secrets και bearer/basic tokens
- Υπάρχει strict mode με `npm run scheduled:sync:strict`

## Mobile development build

- Προστέθηκε `expo-dev-client`
- Προστέθηκε `eas.json` με Android development profile και APK output
- Προστέθηκε Android package `com.mikekent1.opportunityradar`
- Προστέθηκε script `npm run start:dev` για dev-client runtime
- Το development build θα χρησιμοποιηθεί επειδή το διαθέσιμο Expo Go στο
  Android κινητό δεν είναι συμβατό με το SDK του project

## Αρχεία-κλειδιά

- `App.tsx`: κεντρικό UI και συμπεριφορά εφαρμογής
- `src/components/OpportunityCard.tsx`: κάρτα ευκαιρίας
- `src/services/opportunities.ts`: queries, sync και Realtime
- `src/lib/supabase.ts`: Supabase client
- `supabase/functions/sync-opportunities/index.ts`: εξωτερικά API και εισαγωγή δεδομένων
- `supabase/migrations/`: ιστορικό αλλαγών βάσης
- `.env`: τοπικά public στοιχεία Supabase, δεν ανεβαίνει στο Git

## Έλεγχοι

- TypeScript compilation: επιτυχής
- Expo Doctor: 21/21
- Production web export: επιτυχές
- Supabase REST API και Edge Function: επιτυχής απόκριση

## Επόμενα πιθανά βήματα

- Authentication και αποθηκευμένα αγαπημένα
- Ειδοποιήσεις για giveaways που λήγουν
- Βελτίωση branding, navigation και λεπτομερούς οθόνης
