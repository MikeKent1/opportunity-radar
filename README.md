# Opportunity Radar

React Native / Expo εφαρμογή που συγκεντρώνει giveaways και grants σε ένα feed.

## Περιλαμβάνει

- Supabase client με το Project URL και anon public key στο τοπικό `.env`
- Αυτόματα `select` queries και Realtime ενημερώσεις από τον πίνακα `opportunities`
- Supabase Edge Function για server-side συγχρονισμό
- Adapter για το επίσημο Simpler.Grants.gov API
- GamerPower API adapter για ενεργά gaming giveaways
- Epic Games Store adapter για τα τρέχοντα εβδομαδιαία δωρεάν παιχνίδια
- FreeToGame adapter για μόνιμα free-to-play παιχνίδια
- CheapShark adapter για προσφορές με τελική τιμή μηδέν
- EU Funding & Tenders adapter για ενεργές ευρωπαϊκές χρηματοδοτήσεις
- TED Search API adapter για ενεργούς ευρωπαϊκούς δημόσιους διαγωνισμούς
- Demo δεδομένα μέχρι να εγκατασταθεί το schema

## 1. Σύνδεση Supabase CLI — μόνο την πρώτη φορά

```bash
npm run supabase:login
npm run supabase:link
```

Τρέξε αυτές τις δύο εντολές μία φορά από δικό σου PowerShell μέσα στον φάκελο
του project, ώστε να ολοκληρώσεις εσύ το browser login και να πληκτρολογήσεις
τυχόν verification code ή database password χωρίς να τα μοιραστείς στο chat.

Μετά την αρχική εξουσιοδότηση, οι αλλαγές της βάσης αποθηκεύονται ως migrations
στο `supabase/migrations` και εφαρμόζονται χωρίς χρήση του SQL Editor:

```bash
npm run db:check
npm run db:push
```

Το `db:check` κάνει ασφαλές dry run. Το `db:push` εφαρμόζει μόνο migrations που
δεν έχουν ήδη εκτελεστεί και κρατά migration history στο Supabase.

## 2. API keys στη Supabase

Τα API keys δεν πρέπει να μπουν σε μεταβλητές `EXPO_PUBLIC_*`, επειδή αυτές
ενσωματώνονται στο mobile app. Πρόσθεσέ τα ως Edge Function secrets:

```bash
npx supabase secrets set GRANTS_API_KEY=YOUR_KEY
npx supabase secrets set GRANTS_API_URL=https://api.simpler.grants.gov/v1/opportunities/search
npx supabase secrets set GAMERPOWER_API_URL=https://www.gamerpower.com/api/giveaways?sort-by=date
npx supabase secrets set EPIC_GAMES_API_URL="https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US"
npx supabase secrets set FREETOGAME_API_URL=https://www.freetogame.com/api/games?sort-by=release-date
npx supabase secrets set CHEAPSHARK_API_URL="https://www.cheapshark.com/api/1.0/deals?upperPrice=0&sortBy=Recent&pageSize=60"
npx supabase secrets set EU_FUNDING_API_URL=https://api.tech.ec.europa.eu/search-api/prod/rest/search
npx supabase secrets set TED_API_URL=https://api.ted.europa.eu/v3/notices/search
```

Το GamerPower API δεν απαιτεί API key. Η εφαρμογή διατηρεί attribution και
ανοίγει τα giveaway links μέσω GamerPower, όπως απαιτούν οι όροι χρήσης του API.

Το Epic Games endpoint δεν απαιτεί API key. Επειδή δεν είναι επίσημα
τεκμηριωμένο ως public API, ο parser είναι απομονωμένος στην Edge Function ώστε
να μπορεί να προσαρμοστεί χωρίς νέα έκδοση του mobile app.

Το FreeToGame επίσης δεν απαιτεί API key. Τα αποτελέσματά του εμφανίζονται σε
ξεχωριστό tab, επειδή είναι μόνιμα free-to-play και όχι προσωρινά giveaways.

Το CheapShark δεν απαιτεί API key. Γίνονται μόνο δύο requests ανά συγχρονισμό
και τα links περνούν από το CheapShark redirect για attribution.

Μετά από κάθε συγχρονισμό γίνεται deduplication βάσει κανονικοποιημένου τίτλου.
Όταν η ίδια προσφορά υπάρχει σε πολλές πηγές, διατηρείται μία εμφάνιση με σειρά
προτεραιότητας Epic Games → GamerPower → CheapShark.

Το EU Funding & Tenders χρησιμοποιεί το δημόσιο SEDIA Search API της Ευρωπαϊκής
Επιτροπής χωρίς προσωπικό API key. Οι ενεργές ευκαιρίες εμφανίζονται στο tab
`Grants` με ένδειξη `EU Grant`.

Το TED Search API δεν απαιτεί API key. Εισάγονται πρόσφατοι ενεργοί διαγωνισμοί
με μελλοντικό deadline και εμφανίζονται στο ξεχωριστό tab `Tenders`.

## 3. Αυτόματος συγχρονισμός EU/TED

Επειδή τα EU Funding & Tenders και TED endpoints δεν διαβάζονται αξιόπιστα
απευθείας από το Supabase Edge Runtime, ο αυτόματος συγχρονισμός γίνεται με
GitHub Actions.

Το workflow `.github/workflows/sync-eu-ted.yml` τρέχει κάθε μέρα στις 05:17 UTC
και μπορεί να τρέξει και χειροκίνητα από το GitHub Actions tab.

Απαιτούμενα GitHub repository secrets:

```bash
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

Για την προστασία του ingest endpoint χρειάζεται ένα από τα παρακάτω:

```bash
SUPABASE_ACCESS_TOKEN
```

ή:

```bash
EU_INGEST_TOKEN
```

Με `SUPABASE_ACCESS_TOKEN` από account που έχει δικαιώματα στο Supabase project,
τα scripts ανανεώνουν αυτόματα το προστατευτικό `EU_INGEST_TOKEN` πριν από κάθε
ingest. Αν δεν υπάρχει τέτοιο access token, μπορείς να βάλεις σταθερό
`EU_INGEST_TOKEN` και στα GitHub Secrets και στα Supabase Edge Function secrets.

## 4. Deploy της function

```bash
npm run functions:deploy
```

## 5. Εκκίνηση

```bash
npm install
npm start
```

Σκάναρε το QR με Expo Go ή τρέξε `npm run android` / `npm run web`.
