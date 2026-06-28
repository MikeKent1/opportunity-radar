# Prizen

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
- Product Hunt adapter για πρόσφατα startup/product launches
- Kaggle adapter για ενεργά competitions
- Curated RSS feeds adapter για επιλεγμένες δημόσιες πηγές
- Reddit curated subreddits adapter μέσω OAuth API
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

Αν ο τοπικός Supabase CLI λογαριασμός δεν έχει Management API privileges,
υπάρχει και manual GitHub Actions workflow `.github/workflows/apply-db-migrations.yml`.
Για να λειτουργήσει από GitHub Actions, προτίμησε το IPv4 Transaction Pooler
connection string από:

```txt
Supabase → Connect → Transaction pooler
```

και πρόσθεσέ το ως GitHub secret:

```bash
SUPABASE_DB_URL
```

Εναλλακτικά, για local/direct χρήση μπορείς να κρατήσεις μόνο:

```bash
SUPABASE_DB_PASSWORD
```

και τρέξε `Apply DB migrations` από το GitHub Actions tab.

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
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL
SUPABASE_DB_PASSWORD
PRODUCT_HUNT_API_KEY
PRODUCT_HUNT_API_SECRET
PRODUCT_HUNT_ACCESS_TOKEN
KAGGLE_API_TOKEN
RSS_FEED_URLS
RSS_KEYWORDS
REDDIT_CLIENT_ID
REDDIT_CLIENT_SECRET
REDDIT_USER_AGENT
REDDIT_SUBREDDITS
REDDIT_KEYWORDS
REDDIT_MIN_SCORE
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

Η προτεινόμενη λύση για GitHub Actions είναι το `SUPABASE_SERVICE_ROLE_KEY`.
Με αυτό, τα EU/TED scripts γράφουν κατευθείαν στον πίνακα `opportunities` με
server-side δικαιώματα, χωρίς να χρειάζεται να αλλάζουν Supabase secrets από το
CLI και χωρίς να περνούν από το `EU_INGEST_TOKEN`.

Το Product Hunt χρησιμοποιεί το επίσημο API v2 / GraphQL. Τα credentials
μένουν μόνο ως GitHub Secrets και το scheduled sync εισάγει τα πρόσφατα
launches ως πηγή `producthunt`.

Το Kaggle χρησιμοποιεί το επίσημο Kaggle CLI με `KAGGLE_API_TOKEN` από τα
Kaggle account settings. Τα ενεργά competitions εισάγονται ως πηγή `kaggle`
και εμφανίζονται στο φίλτρο `Competitions`.

Τα curated RSS feeds ρυθμίζονται με το GitHub secret `RSS_FEED_URLS`. Μπορεί να
είναι comma-separated ή multiline λίστα από RSS/Atom URLs. Αν το
`RSS_KEYWORDS` μείνει άδειο, κρατάμε πρόσφατα items από τις curated πηγές. Αν
δοθεί, λειτουργεί ως φίλτρο λέξεων-κλειδιών.

Το Reddit χρησιμοποιεί OAuth client credentials και curated subreddits από το
GitHub secret `REDDIT_SUBREDDITS`. Αν λείπουν τα Reddit credentials ή τα
subreddits, το script ολοκληρώνεται χωρίς error και εισάγει 0 εγγραφές. Για
spam control υπάρχουν optional `REDDIT_KEYWORDS` και `REDDIT_MIN_SCORE`.

Το scheduled sync είναι resilient: το `npm run scheduled:sync` τρέχει όλους τους
providers μέσω `scripts/sync-all.mjs`, γράφει summary στο GitHub Actions, κάνει
redaction σε ευαίσθητες τιμές στα logs, και αποτυγχάνει μόνο αν αποτύχουν όλοι
οι providers. Για αυστηρή συμπεριφορά όπου οποιοδήποτε provider failure ρίχνει
το job υπάρχει:

```bash
npm run scheduled:sync:strict
```

Στο ίδιο summary εμφανίζονται πλέον και οι Edge Function providers:
GamerPower, Epic Games, FreeToGame, CheapShark και Grants.gov.

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

## 6. Android development build

Αν το Expo Go δεν είναι συμβατό με το SDK του project, χρησιμοποίησε custom
development build:

```bash
npx eas-cli login
npx eas-cli build --platform android --profile development
```

Μετά την εγκατάσταση του APK στο κινητό, τρέξε:

```bash
npm run start:dev
```

και άνοιξε το project μέσα από την εγκατεστημένη εφαρμογή Prizen Dev.

## 7. Apify Instagram social monitoring

To MVP einai etoimo gia Instagram giveaways mono mesa apo Apify. Den kanoume direct scraping apo to app.

Topika sto `.env` i sta GitHub Secrets vale:

```bash
APIFY_TOKEN=YOUR_APIFY_TOKEN
INSTAGRAM_ACTOR_ID=sones/instagram-posts-scraper-lowcost
INSTAGRAM_ACTOR_MODE=lowcost
INSTAGRAM_POSTS_LIMIT=10
INSTAGRAM_ROTATION_BUCKETS=4
INSTAGRAM_NEWER_THAN_DAYS=5
INSTAGRAM_NEWER_THAN_LOOKBACK_MINUTES=30
```

Gia local/manual sync:

```bash
npm run sync:apify
```

Gia dokimastiko run se liga accounts:

```bash
INSTAGRAM_SOURCE_USERNAMES=logitechg,corsair npm run sync:apify
```

Gia na perasei sto Supabase schema:

```bash
npm run db:check
npm run db:push
```

Ti ftiaxnei i migration:

- `social_sources`: Instagram accounts pou parakolouthoume
- `social_posts`: ta posts pou fernei o Apify actor
- extra social fields sto `opportunities`, opos `source_type`, `category`, `subcategory`, `participation_steps`, `participation_url`

Arxika seed Instagram sources:

- `mrbeast`
- `playstation`
- `razer`
- `corsair`
- `xbox`
- `nintendoamerica`
- `logitechg`
- `steelseries`

Gia na prostheseis neo Instagram source:

```sql
insert into public.social_sources (platform, username, display_name, category, enabled)
values ('instagram', 'username_here', 'Display Name', 'giveaways', true)
on conflict (platform, username) do update
set enabled = true, display_name = excluded.display_name;
```

O rule-based detector psaxnei sto caption lekseis opos:

```txt
giveaway, win, winner, prize, enter, follow, comment, tag, share, contest, sweepstakes
```

An to post moiazei me giveaway, dimiourgei opportunity me:

- `source_type = social`
- `source = Instagram username`
- `category = giveaways`
- `subcategory = game | cash | trip | gift_card | hardware | other`

Argotera, gia AI parser, tha prosthesoume OpenAI-based classifier/extractor pou tha vriskei pio kathara prizes, dates, participation steps kai risk/spam score.

## 8. Giveaway reward categories

Ta giveaways den xwrizontai pleon kyriws me vasi tin pigi, alla me vasi to reward:

- `game`
- `dlc`
- `in_game_item`
- `gift_card`
- `hardware`
- `cash`
- `trip`
- `software`
- `other`

I pigi paramenei sto `source`, px `gamerpower`, `epicgames`, `logitechg`, enw to `subcategory` deixnei ti kerdizeis.

Gia na kaneis backfill/refresh sta yparxonta active giveaways:

```bash
npm run rewards:backfill
```

To `npm run scheduled:sync` trexei pleon kai reward categorization sto telos, wste ta nea imports na pairnoun swsto `subcategory`.

## 9. Google auth kai saved opportunities

To app exei foundation gia Supabase Auth me Google OAuth.

Sto Supabase Dashboard:

1. Anoikse `Authentication` -> `Providers`.
2. Energopoihse `Google`.
3. Vale Google OAuth Client ID kai Client Secret apo Google Cloud Console.
4. Sta redirect URLs prosthese:

```txt
prizen://auth/callback
```

Gia Expo web/local testing prosthese kai to redirect pou tha sou emfanisei to Expo dev server, an xreiastei.

To schema gia ta saved opportunities einai sto migration:

```txt
supabase/migrations/20260628100000_add_saved_opportunities.sql
```

Efarmogi:

```bash
npm run db:push
```

I Fasi 1 prosthetei login/logout kai asfales table `saved_opportunities`. Ta actual save buttons kai `Saved` tab einai Fasi 2.
