# Prizen — Κατάσταση Project

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

## Apify Instagram social monitoring

- Prosthiki migration `20260627143000_add_apify_social_monitoring.sql`
- Dimiourgountai `social_sources` kai `social_posts`
- To `opportunities` pairnei optional social fields: `source_type`, `category`, `subcategory`, `participation_steps`, `expires_at`, `participation_url`
- Arxika seed sources: mrbeast, playstation, razer, corsair, xbox, nintendoamerica, logitechg, steelseries
- Prosthiki script `npm run sync:apify`
- To script diavazei enabled Instagram sources, trexei ton Apify Instagram actor, apothikevei posts kai kanei duplicate-safe opportunity import
- O detector einai rule-based, oxi OpenAI: psaxnei giveaway keywords kai vgazei subcategory `game`, `cash`, `trip`, `gift_card`, `hardware` i `other`
- To scheduled resilient sync perilamvanei pleon optional provider `Apify Instagram`
- To proto successful Apify sync apothikeuse 15 Instagram posts kai dimiourgise 2 social giveaway opportunities apo `logitechg` kai `corsair`

## Reward-based giveaway categorization

- Prosthiki shared classifier `scripts/lib/reward-classifier.mjs`
- Prosthiki backfill command `npm run rewards:backfill`
- Ta giveaways xwrizontai pleon me vasi to reward: `game`, `dlc`, `in_game_item`, `gift_card`, `hardware`, `cash`, `trip`, `software`, `other`
- To UI deixnei deuteri seira filters mesa sto `Giveaways`: All, Games, DLC, In-game, Gift cards, Hardware, Cash, Trips, Software, Other
- To Apify Instagram sync xrisimopoiei ton idio reward classifier
- To scheduled resilient sync trexei sto telos `Reward categorization`
- To backfill efarmostike se 94 active giveaways: 17 games, 29 DLC, 44 in-game items, 2 hardware, 2 software

## Main screen compact header

- Afairesi tou megalou hero panel apo tin arxiki othoni.
- Ta stats emfanizontai pleon se mikro compact row kato apo to top bar: active opportunities kai funding count.
- To search, ta filters kai to feed anevikan psilotera, wste na fainontai perissoteres eukairies amesa.
- To app name sto top bar einai pleon kentrarismeno orizontia, me kalutero top spacing gia Android status bar.
- Afairesi tou diakosmitikou `OR` button kai tou manual sync button apo to main header.
- To app den kanei pleon provider sync sto app startup. To pull-to-refresh fortonei ksana mono ta idi yparxonta Supabase dedomena.

## Feed interaction performance

- Ta main tabs kai ta giveaway reward tabs enimeronoun pleon to active state amesa, enw to feed filtering mporei na ginei deferred.
- Prosthiki prepared search/filter metadata gia na min ypologizetai ksana haystack kai giveaway status se kathe tab press.
- To funding count ypologizetai me memoized value.
- To `OpportunityCard` egine memoized component gia ligotera unnecessary rerenders otan allazoun filters/tabs.
- To `FlatList` renderarei mikrotera batches gia na min mplokarei to tab press se megalo feed.

## App naming

- To app metonomastike se `Prizen` sto main header kai sto Expo app config.
- Enimerothikan oi vasikes project epikefalides se `README.md` kai `PROJECT_STATUS.md`.

## Cash giveaway classification

- Veltiosi tou `scripts/lib/reward-classifier.mjs` gia cash-focused reward detection.
- To `cash` pianei pleon money amounts (`$500`, `1000 EUR`) kai orous opos prize money, prize pool, bounty, stipend, scholarship, microgrant, payout, wire transfer, cash reward.
- To `gift_card` paramenei pio psila apo `cash`, wste `Steam gift card` i `Amazon card` na min mpei lathos sto Cash.
- Etrexe `npm run rewards:backfill`: elegxthikan 94 active giveaways, alla den vrethikan pragmatika cash rewards sta yparxonta dedomena.
- To `Giveaways > Cash` paramenei adeio mexri na prostethoun cash-focused sources i na erthei neo cash giveaway apo RSS/Reddit/social sync.

## Instagram source expansion

- Prosthiki migration `20260627164500_expand_instagram_social_sources.sql`.
- Prostithentai 22 nea curated Instagram sources se batches: hardware, gaming publishers/platforms kai mikra cash/sweepstakes candidates.
- Nea accounts: alienware, asusrog, msigaming, nzxt, hyperx, elgato, secretlab, scufgaming, turtlebeach, astrogaming, bethesda, ubisoft, ea, riotgames, blizzard, 2k, bandainamcous, devolverdigital, cashapp, venmo, pch, jackpocket.
- Prosthiki view `social_source_performance` gia metrisi ana account: posts_saved, giveaway_posts, imported_opportunities kai latest_posted_at.
- To `scripts/sync-apify-instagram.mjs` grafei pleon `sourceStats` sto JSON summary gia na vlepoume poia Instagram accounts apodidoun.
- `npm run db:check` perase kai deixnei oti i migration einai etoimi gia push.
- Prosthiki migration `20260627180000_expand_instagram_hardware_sources.sql` kai efarmostike sti remote vasi.
- Prostethikan 15 akoma Instagram sources: nvidiageforce, amd, intelgaming, coolermaster, gskillgaming, thermaltakeusa, zotacgaming, aorus_official, gigabyte_official, originpc, maingear, cyberpowerpc, ibuypowerpc, drop, streamlabs.
- Ta Instagram sources einai pleon 45 enabled: 24 hardware, 8 gaming, 8 giveaways, 4 cash_candidate, 1 creator_tools.

## Low-cost Apify Instagram actor

- To `scripts/sync-apify-instagram.mjs` ypostirizei pleon kai ton actor `sones/instagram-posts-scraper-lowcost`.
- Prosthiki `INSTAGRAM_ACTOR_MODE=lowcost` kai auto-detect otan to `INSTAGRAM_ACTOR_ID` periexei `instagram-posts-scraper-lowcost`.
- Gia lowcost mode to input stelnei `usernames`, `postsPerProfile`, residential proxy config kai rate-limit settings.
- O parser ypστηrizei lowcost output fields: `caption.text`, `post_url`, `scraped_username`, `user.username`, `image_versions2`, `carousel_media`.
- Prosthiki `INSTAGRAM_SOURCE_USERNAMES` gia mikro dokimastiko sync se epilegmena accounts.
- To GitHub scheduled workflow pernάei pleon optional `INSTAGRAM_ACTOR_MODE` kai `INSTAGRAM_SOURCE_USERNAMES` secrets.
- Dokimi me `sones/instagram-posts-scraper-lowcost` se `logitechg,corsair` petyxe: actorMode `lowcost`, 24 postsSaved, 6 giveaway detections/opportunities sto script summary.
- To local `.env` gyrise sto low-cost actor xwris na emfanistoun secrets.
- To GitHub scheduled sync xrisimopoiei pleon stathera `sones/instagram-posts-scraper-lowcost` kai `INSTAGRAM_ACTOR_MODE=lowcost`, anti na eksartatai apo `INSTAGRAM_ACTOR_ID` secret.
- Sto lowcost mode to sync stelnei pleon `newerThan` me vasi to pio prosfato `social_posts.posted_at` ana account, me default 30 lepta lookback.
- To `INSTAGRAM_NEWER_THAN_LOOKBACK_MINUTES` mporei na rythmisei to safety window gia na min xathoun posts se timezone/pagination edge cases.
- Diorthothike local `.env` BOM issue pou ekane to sync na min vriskei `EXPO_PUBLIC_SUPABASE_URL` kai na kanei skip prin ftasei sto Apify.
- To lowcost `newerThan` grouping den trexei pleon ena Apify run ana account. Kanei mexri 2 runs: ena gia nea accounts xwris istoriko kai ena gia accounts me yparxonta posts.

## Instagram sync rotation

- Prosthiki `INSTAGRAM_ROTATION_BUCKETS` sto `scripts/sync-apify-instagram.mjs`.
- To GitHub scheduled sync exei pleon `INSTAGRAM_ROTATION_BUCKETS=4`, ara trexei peripou to 1/4 twn enabled Instagram accounts ana mera kai ola ta accounts se kyklo 4 imerwn.
- To rotation einai deterministic ana username kai imerominia, enw to `INSTAGRAM_SOURCE_USERNAMES` kanei bypass to rotation gia manual targeted tests.
- To Apify Instagram JSON summary kai to GitHub scheduled summary emfanizoun pleon note me rotation bucket kai posa sources epilexthikan.
- To low-cost actor xrisimopoiei pleon fixed `INSTAGRAM_NEWER_THAN_DAYS=5` sto scheduled workflow, anti na pairnei koino cutoff apo palia account timestamps.
- To per-account latest-post fallback paramenei mono an `INSTAGRAM_NEWER_THAN_DAYS=0`.

## Google auth foundation

- Prosthiki Expo/Supabase Google OAuth foundation me `expo-auth-session` kai `expo-web-browser`.
- Prosthiki `scheme: prizen` sto `app.json` gia native auth callback `prizen://auth/callback`.
- Prosthiki `src/services/auth.ts` me `signInWithGoogle` kai `signOut`.
- To app einai pleon login-gated: xwris session deixnei mono Google sign-in screen.
- Prosthiki `Settings` tab gia account info kai logout. Meta to logout o xristis epistrefei sto login screen.
- Prosthiki migration `20260628100000_add_saved_opportunities.sql` me `saved_opportunities`, RLS policies kai per-user access.
- Fasi 1 einai login/logout + schema. Save/unsave buttons kai `Saved` tab paramenoun gia Fasi 2.
- To Expo `name` paramenei `Prizen`, alla to EAS `slug` kratithike `opportunity-radar` giati to yparxon `extra.eas.projectId` einai syndedemeno me auto to project slug.
