# Opportunity Radar — Κατάσταση Project

Τελευταία ενημέρωση: 26 Ιουνίου 2026

## Τι είναι το app

React Native / Expo εφαρμογή που συγκεντρώνει ενεργά gaming giveaways και
ευκαιρίες χρηματοδότησης σε ένα ενιαίο feed.

## Τεχνολογίες

- React Native, Expo και TypeScript
- Supabase Database, Realtime και Edge Functions
- GamerPower API
- Epic Games Store promotions endpoint
- FreeToGame API
- CheapShark API
- EU Funding & Tenders / SEDIA Search API
- TED Search API
- Simpler.Grants.gov API adapter
- GitHub Actions για scheduled EU/TED sync

## Τι έχει υλοποιηθεί

- Responsive dark-themed UI στα ελληνικά
- Λίστα ευκαιριών με αναζήτηση και φίλτρα
- Κάρτες με τίτλο, περιγραφή, αξία, deadline, tags, εικόνα και εξωτερικό link
- Pull-to-refresh και κουμπί χειροκίνητου συγχρονισμού
- Αυτόματος συγχρονισμός κατά την εκκίνηση
- Realtime ενημέρωση όταν αλλάζουν εγγραφές στο Supabase
- Demo δεδομένα ως fallback
- Ημερήσιος αυτόματος συγχρονισμός για EU Funding & Tenders και TED

## Supabase

- Το project είναι συνδεδεμένο μέσω Supabase CLI
- Οι αλλαγές της βάσης εκτελούνται πλέον με migrations, χωρίς SQL Editor
- Δημιουργήθηκε ο πίνακας `opportunities`
- Προστέθηκαν indexes, RLS policy, Realtime και trigger για `updated_at`
- Η Edge Function `sync-opportunities` είναι deployed
- Τα migrations είναι ενημερωμένα με την απομακρυσμένη βάση

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
