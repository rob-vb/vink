# Checklist livegang Vink

Stand: 7 oktober 2026. Vink een punt af als het klaar is.

## Moet vóór livegang

### Juridisch
- [x] Schrijf de echte privacyverklaring. Klaar op 7 oktober 2026 (branch `legal-texts`). Laat een jurist de tekst lezen.
- [x] Schrijf de echte voorwaarden. Klaar op 7 oktober 2026 (branch `legal-texts`). Laat een jurist vooral de aansprakelijkheid lezen.
- [ ] Maak een apart te tekenen verwerkersovereenkomst (DPA) voor klanten. De verwerkersafspraken (AVG artikel 28) staan al in de voorwaarden, bij "Verwerking van persoonsgegevens". Het Custom-abonnement belooft een getekende versie.
- [ ] Teken de DPA's met de subverwerkers: Convex, Cloudflare, Google Vertex, TypeSafe, Resend en Stripe. Gebruik waar het kan de standaard-DPA van een betaald plan.
- [x] TypeSafe: geen zero retention. Besloten op 7 oktober 2026: we vragen het niet. De zin "Mag logs bewaren" blijft staan.
- [ ] Vul het huisnummer in bij `LEGAL_ADDRESS` (`lib/site.ts`). Het adres staat in het Privacybeleid en de Voorwaarden.
- [x] Google Analytics staat uit (geen `NEXT_PUBLIC_GA_ID` op prod). Besloten op 7 oktober 2026: GA is uit het Privacybeleid gehaald. Zet je GA aan, zet dan eerst de GA-tekst terug in het Privacybeleid, de cookielijst en de Subverwerkers.
- [x] (Staat al goed, 7 oktober 2026.) Stripe: zet bij Billing → "Manage failed payments" na de laatste poging op "Cancel the subscription". De Voorwaarden zeggen dat het abonnement dan stopt.
- [x] Ruim oude tellers op. Klaar op 7 oktober 2026: cron `auth rate limits` verwijdert elke dag tellers die ouder zijn dan 1 dag (branch `legal-texts`, nog niet gedeployd).
- [x] Laat pm2 de logs roteren. Klaar op 7 oktober 2026: `pm2-logrotate`, elke dag, 180 bestanden bewaard. Geldt voor alle pm2-apps op de VPS.

### E-mail-in
- [ ] Koop een vast intake-domein, bijvoorbeeld `vink-in.nl`. Nu draait e-mail-in op het testdomein `200squares.com`.
- [ ] Zet het domein in Cloudflare (catch-all → Worker `vink-intake-email`) en zet `INBOUND_DOMAIN` op prod.
- [ ] Vul bij Subverwerkers de regio van Cloudflare Email Routing in. Nu staat er "Nog te bevestigen" (`messages/*/security.json`).

### Koppelingen
- [x] Zet de Google OAuth-app (GCP-project "Docuhelper") van "Testing" op "In production". Klaar op 7 oktober 2026. `vink.page` is geverifieerd in Search Console. Laat het TXT-record in Cloudflare staan.

### Configuratie op prod
- [ ] Kies het echte adres voor `CONTACT_TO` en `SIGNUP_NOTIFY_TO`. Nu gaan ze voor de test naar `hi@robvb.com`.
- [ ] Controleer de Organisaties met `internal_unlimited`. Laat alleen echt interne Organisaties zo staan.
- [x] Deploy de laatste `main` van de site. Klaar op 7 oktober 2026 (`068e5b3`, KvK staat in de footer).

### Stripe live
- [ ] Haal de sandbox weg van prod. Sinds 7 oktober 2026 draait prod op de Stripe-sandbox (env vars, webhook in de sandbox, `hi@robvb.com` met sandbox-klant `cus_VOcmaA94A5bqYY` en een test-abonnement). Annuleer het abonnement, zet de Organisatie terug op `internal_unlimited` en haal `stripeCustomerId` weg. Een live key kent de sandbox-klant niet.
- [ ] Maak twee live restricted keys: één voor Convex (de app) en één voor het setup-script. De rechten staan in ADR 0007.
- [ ] Zet in live mode Stripe Tax aan: adres van het hoofdkantoor, registratie Nederland met de regeling "small seller".
- [ ] Draai `scripts/stripe-setup.mts` in live mode met `--webhook-url https://spotted-parakeet-30.eu-west-1.convex.site/stripe/webhook`.
- [ ] Zet "iDEAL recurring payments" aan op de configuratie "Vink" in live mode.
- [ ] Zet de vier `STRIPE_*`-variabelen op prod Convex.
- [ ] Geef de key Invoices **Write**. Test daarna een mislukte eerste SEPA-betaling: Vink moet de factuur annuleren.
- [ ] Doe één echte betaling en betaal die daarna terug.

## Kan na livegang

- [ ] Zapier: maak de app openbaar. Zapier eist eerst 3 gebruikers met live Zaps.
- [ ] Make: review aangevraagd op 7 oktober 2026 (app `vink-fsvhks`). Bewaar de drie testscenario's in Make. Na goedkeuring: zet Make in `lib/platforms.ts` op `native`.
- [ ] Microsoft (Excel): zet de omgevingsvariabelen. Pas daarna mag Excel op de site.
- [ ] Bewaking: stuur fouten uit de Convex-logs naar e-mail of een log-stream. Een voorbeeld is een afgekeurd btw-nummer.
- [ ] Kwaliteit: verbeter "Needs Review". Die vangt nu de helft van de foute waarden. Ticket 40 staat klaar.
- [ ] Screenshots: controleer de `TODO(screenshots)`-notities in de code. Vervang tijdelijke plaatjes.
- [ ] Dev opruimen: haal de oude `POLAR_*`-variabelen weg van dev Convex.

## Al klaar

- [x] Echte pipeline-test op Vertex EU met Jev: 82 van 84 waarden goed.
- [x] R2-opslag op prod.
- [x] Resend verstuurt vanaf `hi@vink.page`.
- [x] Stripe in de sandbox en op prod getest, inclusief btw en iDEAL bij een Plan.
- [x] KvK-nummer in de footer (PR #33).
