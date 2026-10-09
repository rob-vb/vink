# Digitale documenten die nog met de hand worden overgetypt of beoordeeld: kandidaten voor de Vink-demo

Date: 2026-10-09. Complements `research-paper-processing-nl.md` (paper and field work, not repeated here).

Scope: the input is already digital (PDF by email, email text, web-form mail, attachment with photos). The target customer is never in SBI section H, SBI 45 or SBI 77.1. Update from the product owner: motor claims (autoschade, ruitschade) are allowed when the customer is the insurer, volmacht or intermediary (SBI 65, 66), not a garage or dealer.

Legend: **[FACT]** = stated in the cited source. **[INFERENCE]** = my reasoning. **[GAP]** = looked, found no good source. **[VENDOR]** = claim from a company that sells the tool.

Reading caveat: web search returned summaries for most pages. Pages I read in full or extracted myself are marked **(read)**. The others should be re-checked on the page before a number goes on the public site.

## 1. Samenvatting (Nederlands, B1)

- Veel digitale documenten worden nog door een mens gelezen en overgetypt. De mens controleert ook of alles klopt.
- Het sterkste bewijs is er voor klantorders per mail (PDF) bij groothandels en producenten. Bijna alle bronnen zijn leveranciers. Wij markeren dat.
- Bij verzekeraars en volmachten gaat het om grote aantallen. Verzekeraars handelen gemiddeld ongeveer 300 duizend waterschades per jaar af (Verbond, 2025, gelezen in de PDF).
- Eén Nederlandse verzekeraar (Nh1816) krijgt 240.000 tot 306.000 e-mails en bijlagen per jaar op de schadeafdeling. Dat is een leverancierscase.
- Inkoopfacturen zijn een druk veld: Basecone, Exact, Twinfield, Yuki en Peppol. Begin daar niet mee.
- Schademeldingen, subsidieaanvragen en orders zijn "lezen en beoordelen"-werk. Vink vult de velden in. De Needs Review-stap laat zien wat de medewerker moet nakijken.
- Harde cijfers over minuten per dossier ontbreken in Nederland. We hebben alleen leverancierscijfers.
- Beste demo-documenten: een waterschade-meldformulier met lijst van beschadigde spullen, een subsidieaanvraag van een vereniging, en een klantorder als PDF bij een sanitairgroothandel.

## 2. Table of processes

"Crowded" = how many tools already serve it. Competitor names come from the sources in section 5.

| # | Process + sector (SBI) | Incoming document + channel | Who types or judges | Why still manual | Target system | Crowded | Fit for Vink |
|---|---|---|---|---|---|---|---|
| 1 | Klantorders (order entry) at groothandel and producent (SBI 46, 10-33) | Inkooporder as PDF or Excel, or free text in an email, to a shared inbox | Binnendienst / customer service rep | Many customers, each with own layout. Small customers have no EDI or API. Email is the universal channel. [INFERENCE from vendor texts, see 4.1] | ERP (AFAS, Exact, Business Central, SAP) | Medium-high: Esker, Klippa, Conexiom (not listed for NL), Fellowmind and Incentro order-intake agents, EDI vendors | High. Many layouts, line-item list, data straight into an ERP |
| 2 | Schademelding woonhuis, inboedel, aansprakelijkheid at volmacht, tussenpersoon and verzekeraar (SBI 65.12, 66.22) | Schadeformulier PDF or email with photos, quotes, polis details | Schadebehandelaar or backoffice at volmacht / intermediair | Mix of form, free text and photos. Reports come by mail and portal. Handler must judge dekking, date, cause, amount | Schadesysteem of the volmacht or insurer | Medium: Simplifai (Nh1816, Van Ameyde, 112Schade), Shift Technology; mostly aimed at large insurers | High. Read and judge, list of damaged items, clear flags |
| 3 | Motor- en ruitschade at insurer or volmacht (SBI 65.12) | Meldformulier or mail with photos, offerte of herstelbedrijf | Schadebehandelaar | Reports increasingly come via app (Mobielschademelden.nl, Univé SchadeCheck); mail and forms remain at intermediaries [INFERENCE] | Schadesysteem | High: Solera, Tractable (not seen in NL), Fixico, insurer apps | Medium. Crowded and shifting to apps |
| 4 | Subsidieaanvraag of vereniging at gemeente (SBI 84.11) | Aanvraagformulier PDF by mail with begroting, statuten, jaarrekening | Medewerker subsidies | Many municipalities accept mail or post. Only complete applications are processed. Legal deadlines apply | Zaaksysteem / subsidiesysteem | Low-medium [GAP: no tool survey] | Medium-high. Completeness check is a natural Needs Review. Long public sales cycle |
| 5 | Bezwaarschrift, klacht and Woo-verzoek at gemeente and woningcorporatie (SBI 84.11, 68.20) | Email or letter scan; klachtenformulier by mail | Klachtencoördinator, juridisch medewerker | Registration, deadline and routing are manual. Assessment is legal work | Zaaksysteem, klachtenregistratie | Low-medium [GAP] | Medium. Vink handles intake and routing, not the legal judgement or redaction |
| 6 | Huuraanvraag at verhuurmakelaar and woningcorporatie (SBI 68.31, 68.20) | Email or form with loonstrook, werkgeversverklaring, ID | Verhuurmedewerker | Income and documents must be read and compared with the huurprijs. Many applicants per home | CRM, verhuursysteem | Low-medium [GAP] | Medium. Privacy (AP) and fairness risks, see 4.5 |
| 7 | Garantie- / RMA-claim at webshop and fabrikant (SBI 47.91, 46) | Contactformulier or mail with bon and photos | Klantenservice medewerker | Shop must judge proof of purchase, date and cause (legal burden of proof differs after 6 months) | Helpdesk, RMA tool, ERP | High for returns (Sendcloud and Shopify apps); medium for judging claims | Medium. Close to the existing espresso complaint demo |
| 8 | Sollicitaties and CV at uitzendbureau and recruiter (SBI 78) | CV PDF by mail or job board | Recruiter or planner | Layouts differ; typed into the ATS | ATS (Bullhorn and others) | High: most ATS have CV parsing built in; Klippa, Parseur | Low. Crowded and sensitive data |
| 9 | Groepsaanvraag / RFP at hotel and evenementenlocatie (SBI 55, 56, 82.3) | Email with dates, group size, wishes | Sales or reservations | Requests go to shared inboxes and spreadsheets | PMS, offerte tool | Medium: Proposales, MeetingPackage, Backyou, Mews | Medium. NL evidence is a GAP |
| 10 | Orderbevestiging from supplier checked against own inkooporder (SBI 46, 10-33) | Orderbevestiging PDF by mail | Inkoper | Buyer compares price, quantity, date; large buyers use portals (Gasunie via SAP) [FACT]; small suppliers send PDFs [INFERENCE] | ERP | Low-medium [GAP: no NL source on tolerance rules] | Medium-high. Natural "compare and flag" case |
| 11 | Ledenaanmelding at vereniging and sportclub (SBI 94.99, 93.12) | Aanmeldformulier PDF by mail, with pasfoto | Ledenadministrateur (often volunteer) | Some clubs still ask for a PDF by mail [FACT, 4.7] | Sportlink, own ledenadministratie | Medium: online forms from KNVB/Sportlink | Medium. Low willingness to pay |
| 12 | Inkoopfacturen (all sectors) | Factuur PDF / UBL by mail | Administratie, accountant | Many suppliers, mixed channels | Exact, Twinfield, Moneybird, Snelstart, AFAS | **High**: Basecone, Exact, Twinfield, Yuki, Peppol | Avoid as lead. Site already shows an invoice |

## 3. Top 3 candidates for the website demo document

Rule: two of three come from the "read and judge" group (rows 2 and 4). All names, numbers, IBANs and addresses in the demo must be invented. None duplicate the existing demo (installer werkbon photo, espresso complaint email, invoice).

### Candidate 1 (recommended): Meldformulier waterschade woonhuis, with list of damaged items

- **Exact document**: A PDF "Schadeaangifte opstal / inboedel" that a klant mails to their assurantiekantoor or volmacht, with a short email text ("Gisteravond lekte de wasmachine, zie bijlage"). The form has a table of damaged items. Photos are mentioned, not shown.
- **Fields**:
  - Polisnummer, Naam verzekerde, Adres schadelocatie, Datum schade
  - Oorzaak (keuze: lekkage, rioolwater, storm, anders), Omschrijving
  - Beschadigde zaken (list): Omschrijving, Aanschafjaar, Geschatte waarde
  - Totaal geschat bedrag, IBAN, Foto's bijgevoegd (ja/nee)
- **Needs Review flags that tell the story**: schadedatum more than 30 days before the mail; total does not equal the sum of the rows; cause "anders" or unclear; polisnummer not found; amount above a limit.
- **Why it shows Vink well**: mixed free text and structure; a repeating list; confidence per field; the handler only checks the flagged fields; the data goes to the schadesysteem through a webhook.
- **Story in one sentence**: "Klanten mailen een schadeformulier; Vink zet het in je schadesysteem en laat de behandelaar alleen kijken waar iets niet klopt."
- **Variant**: a ruitschade or autoschade report is allowed now (insurer side). It is a weaker demo: the space is crowded (apps, Solera) and a motor claim needs a vehicle identifier. The earlier "no licence plate visible" rule in memory conflicts with that, so ask the product owner before using it. [INFERENCE]

### Candidate 2: Subsidieaanvraag van een vereniging aan de gemeente

- **Exact document**: A PDF "Aanvraag incidentele subsidie" mailed by a buurtvereniging, with a short begroting table and a list of bijlagen.
- **Fields**:
  - Naam vereniging, KvK-nummer, Contactpersoon, E-mail, IBAN
  - Activiteit (omschrijving), Periode, Aantal deelnemers
  - Begroting (list): Post, Bedrag (inkomsten and uitgaven)
  - Aangevraagd bedrag, Andere subsidies aangevraagd (ja/nee, bedrag)
  - Bijlagen aanwezig: begroting, statuten, jaarrekening (vinkjes)
- **Needs Review flags**: aangevraagd bedrag differs from the begroting total; statuten missing for first-time applicant; IBAN invalid; application incomplete (municipal rules say only complete applications are processed).
- **Why it shows Vink well**: judging work (completeness and sums), a list, a document with attachments, and a clear deadline pressure (legal decision terms).
- **Story in one sentence**: "Verenigingen mailen een subsidieaanvraag; Vink vult het dossier in en meldt wat er ontbreekt."
- **Caution**: public-sector buyers; long sales cycle; the demo may suggest a government use case. The same form logic also fits foundations and funds. [INFERENCE]

### Candidate 3: Klantorder als PDF bij een groothandel in sanitair en installatiemateriaal

- **Exact document**: A PDF "Inkooporder" that an installatiebedrijf mails to the groothandel's orders@ address. The customer's own layout, own artikelnummers, a reference ("Project Kerkstraat 12"), and a gewenste leverdatum.
- **Fields**:
  - Klantnaam, Klant-inkoopordernummer, Projectreferentie, Besteldatum, Gewenste leverdatum
  - Regels (list): Klant-artikelnummer, Omschrijving, Aantal, Eenheid, Prijs per stuk
  - Opmerkingen
- **Needs Review flags**: artikelnummer not found in the own catalogue; price different from the price list; unit unclear ("doos" vs "stuk").
- **Why it shows Vink well**: many senders, many layouts (show 2 different PDFs in the demo); the line-item list; straight into the ERP via the webhook; the strongest ROI story ("5-10 minutes per order" is a vendor claim).
- **Story in one sentence**: "Klanten mailen orders als PDF; Vink zet ze in je ERP."
- **Caution**: this space is crowded for larger companies (Esker, Klippa, Conexiom, Fellowmind, Incentro). Vink's angle: a Form the business sets up itself, cheap enough for a small groothandel, no EDI project. [INFERENCE]
- Avoid auto-parts wholesalers (SBI 45.3 and adjacent).

### Which to pick

Use candidate 1 as the lead demo (most evidence of volume, read-and-judge, list, clear flags). Use candidate 3 as the second, because it is the most recognisable problem for an ERP buyer. Keep candidate 2 for a public-sector or associations use-case page.

## 4. Evidence per process

### 4.1 Klantorders per mail (row 1)

- **[VENDOR, Conexiom via WorkD, 19 Feb 2026]** "Seventy percent of B2B sales orders are still processed manually", with the flow "email, phone calls, fax machines, and spreadsheets before a human types them into an ERP system". The underlying Conexiom study was not found. The article also says a customer service rep opens the PDF and enters the lines. (read) https://www.workd.com/insights/articles/hidden-cost-managing-b2b-orders-email-2026/
- **[VENDOR]** Conexiom blog: customer service and inside sales reps spend 20-40% of their time on manual order handling. https://conexiom.com/blog/the-real-cost-of-manual-order-entry-in-b2b-operations
- **[VENDOR, Prodware ERP]** A Dutch ERP vendor says many Dutch organisations get a large share of orders and offer requests by email, and that retyping takes 5-10 minutes per order, with errors in customer item numbers, scale prices and delivery times. https://www.prodwaregroup.com/nl-nl/wp-content/uploads/sites/11/2025/10/sales-order-agentdef.pdf (summary read)
- **[FACT, older, buyer side]** Distribution Strategy: about 74% of end users frequently order by email, including PDF, Word or Excel attachment (2016, more than 3,500 distributor customers). https://distributionstrategy.com/the-electronic-postman-always-rings-much-more-than-twice/
- **[FACT]** ABB Netherlands accepts orders from customers without EDI through webshop or email in PDF, with a valid PO number and delivery date. https://new.abb.com/low-voltage/nl/support/transparant-zaken-doen-met-abb/orders (from search summary; the page timed out when fetched)
- **[FACT/VENDOR]** Esker describes triage and entry of orders from customer emails in the shared customer-service inbox; Heineken, Paulig (non-EDI order entry into Dynamics AX) are named customers. No Dutch order-entry case with measured hours found. https://www.esker.com/nl/solutions/order-cash/customer-service/order-processing-automatisering
- **[VENDOR]** Fellowmind and Incentro both sell an AI "order intake agent" that turns emails with PDF into ERP orders. https://www.fellowmind.com/en/ai-agent-portfolio/order-intake-agent/ ; https://www.incentro.com/en-ID/services/order-intake-agent
- **[FACT]** Klippa lists SAP, Dynamics 365, AFAS and Exact Online as ERP targets for PO extraction. The article has no statistics on PO processing. (read) https://www.klippa.com/blog/informatief/inkooporder-proces/
- **[FACT]** A Dutch installer (Grimbergen Installaties) reports an average saving of EUR 150 per order for users of EDI ordering. This is a case on the EDI side, not on mail. https://cloud01.topsite.nl/interfilter.nl/project/18/edi-klantcase-grimbergen-installaties-digitale-versie-1951.pdf
- **[FACT]** The Dutch government sent more than 200.000 e-orders in 2025, about a quarter over Peppol. The Dutch Peppol authority advises no national extras for the BIS 3 order. It shows large buyers are digital. [INFERENCE] Small customers of a wholesaler are not. https://orbitax.com/news/country/article/Netherlands-looking-at-e-order_152b05db-5df6-11ef-b4db-366fb390559f (summary)
- **[GAP]** No CBS, Techniek Nederland or other independent figure on the share of wholesale orders that arrive by mail.

### 4.2 Schademeldingen (rows 2 and 3)

- **[FACT, read in the PDF]** "Jaarlijks helpen schadeverzekeraars klanten bij gemiddeld zo'n 100 duizend branden, 300 duizend waterschades en een miljoen schades aan voertuigen." Verbond van Verzekeraars, Financieel jaarverslag verzekeringsbranche 2025. https://www.verzekeraars.nl/media/dzzfo0fd/financieel-jaarverslag-verzekeringsbranche-2025.pdf
- **[FACT]** Intermediaries: 5.602 advieskantoren, 298 (huis)volmachten and 36 serviceproviders in 2025 (Adfiz). https://www.adfiz.nl/media/xkylrkq3/advies-in-cijfers-2025_digitaal-1.pdf (summary)
- **[FACT]** Volmacht market: gross earned premium about EUR 5,22 billion in 2025 (+5%). In Schade, Motor, Brand and Aansprakelijkheid are 86% of the volmacht premium. https://www.verzekeraars.nl/media/gyldgvca/marktrapport-volmachten-2025-1e-halfjaar-def.pdf ; https://verzekeraars.nl/media/teofbrk5/marktrapport-volmachten-2024.pdf (summaries)
- **[VENDOR, read]** Nh1816 (Dutch property and health insurer, about 500.000 customers): the claims department gets 240.000 to 306.000 emails and attachments per year, growing about 10% per year. Simplifai's AI is trained on 4 email categories, 17 document types and 11 key data points. Headline "over 80 hours per week reduced in manual handling", not explained on the page. https://www.simplifai.ai/case-studies/nh1816
- **[VENDOR, read]** Van Ameyde: 2-3 million claim-related emails and documents per year, in 30 countries; Simplifai reads free text that RPA cannot; errors go to manual handling. No time savings stated. https://simplifai.ai/case-studies/van-ameyde
- **[VENDOR, read]** 112Schade (NL) chose Simplifai's claims intake on 3 Dec 2024. No volumes or results stated. https://simplifai.ai/news/simplifai-welcomes-dutch-customer-112schade-to-automate-claims-intake
- **[FACT, summary]** Aegon: for liability claims reported digitally, settlement starts within 24 hours; claims expected above EUR 5.000 cannot use that form. Allianz Direct states decision times of 2 working days for glass damage and 3 weeks for bodywork damage. These are decision times, not handling minutes. https://www.aegon.nl/system/files/2023-09/Aangifteformulier_aansprakelijkheidsverzekering.pdf ; https://www.Allianzdirect.nl/dam/documents/schade/Autoschade%20-%20Stappenplan.pdf
- **[FACT, summary]** Kifid case 2022-0505: a homeowner emailed a water-damage claim form to the intermediary. The intermediary forwarded it a few days later. The insurer rejected the claim for late reporting. Kifid 2026-0097: the intermediary did not tell the consumer that another form was needed. These show the risk of slow manual forwarding. https://www.kifid.nl/wp-content/uploads/2022/06/Uitspraak-2022-0505.pdf ; https://www.kifid.nl/media/feroyey5/uitspraak-2026-0097-bindend.pdf
- **[FACT]** Kifid received 7.832 complaints in 2025 (6.019 in 2024); a third of 2024 complaints concerned schadeverzekeringen. https://www.accountant.nl/nieuws/2026/4/kifid-krijgt-fors-meer-klachten-over-financiele-dienstverleners/ (press)
- **Motor side [FACT]**: Univé SchadeCheck (Solera) from 8 Aug 2025 targets 10.000-15.000 casco claims per year; nearly 2.000 are withdrawn unnecessarily. The Verbond app Mobielschademelden.nl has a ruitschade category and photos. (read for Univé) https://www.banken.nl/nieuws/26336/unive-zet-ai-in-voor-snellere-schadeafhandeling-meer-ruimte-voor-persoonlijke-aandacht ; https://autorai.nl/schade-melden-app-mobielschademelden/
- **Who assesses [INFERENCE from the above]**: at an intermediary or volmacht the schadebehandelaar or backoffice employee reads the report, checks the polis and enters the claim into the insurer's or volmacht's system. I found no Dutch source on minutes per claim. **[GAP]**
- **How crowded**: medium. Simplifai, Shift Technology (agentic claims, launched Sept 2025, references outside NL) and Solera/Tractable (photo estimates) serve large insurers. I found no tool aimed at small intermediaries who handle mailed forms. **[GAP/INFERENCE]** https://www.shift-technology.com/en-gb/resources/press/shift-technology-unveils-agentic-ai-powered-shift-claims
- **Compliance note [INFERENCE]**: claims data carries personal data and the volmacht contract with the insurer limits what can be automated. I found no source on Wft or volmacht rules for automatic intake. **[GAP]** Vink's DPA work is a pre-launch item (memory).

### 4.3 Subsidieaanvragen (row 4)

- **[FACT, summary]** Ermelo prefers digital applications and says email is the fastest way; Weert accepts email or post and says only complete applications are processed; Zuidplas accepts email or DigiD. https://www.ermelo.nl/fileadmin/Site_Ermelo/documenten/Subsidies/021_Aanvraagformulier_jaarlijkse_subsidie_versie_3.pdf ; https://www.weert.nl:443/Downloads/Formulieren/Aanvraagformulier%20subsidie%20Eenmalige%20projectsubsidie%20amateurkunsten.pdf ; https://www.zuidplas.nl/_flysystem/media/aanvraagformulier-corona-subsidie.pdf
- **[FACT, summary]** Required attachments include a project plan with begroting (Weert), statuten, akte and jaarrekening for first-time applicants (Zuidplas). Decision term: six months, extendable by eight weeks, in Leidschendam-Voorburg's regulation. https://leidschendam-voorburg.debatrijk.nl/documents/11/917/documents/9508/ALGEMENE%20SUBSIDIEVERORDENING%20LEIDSCHENDAM-VOORBURG%C2%A0.pdf
- **[GAP]** Number of subsidy applications per municipality and minutes per application. The retyping into the zaaksysteem is **[INFERENCE]**.

### 4.4 Bezwaar, klacht, Woo (row 5)

- **[FACT, summary]** Sira Consulting for BZK: about 25.000 Woo-verzoeken in 2024, about 60% at municipalities; about 1,3 million hours per year, about 61 hours per request on average; 66% handled within the legal term nationally. The heavy work is legal review and redaction, which Vink does not do. https://www.binnenlandsbestuur.nl/bestuur-en-organisatie/sira-consulting/onderzoek-naar-uitvoeringslasten-van-woo-verzoeken ; https://www.eerstekamer.nl/overig/20260513/uitvoeringslasten_woo_verzoeken_2/document
- **[FACT, summary]** Small numbers of bezwaren per municipality: Dinkelland and Tubbergen 79 zaken and 102 bezwaarschriften in 2024; Hattem 25-55 per year. Date of receipt matters for timeliness, so registration must use the mail date. https://gemeenteraad.dinkelland.nl/Vergaderingen/Commissie-Sociaal-Domein-Bestuur/2025/07-oktober/19:30/Raadsbrief-2025-36-jaarverslag-2024-van-de-commissie-Bezwaarschriften/2025-36-Jaarverslag-2024-commissie-bezwaarschriften-bijlage-2.pdf
- **[FACT, summary]** Complaints can be filed by email in several municipal and corporation rules; the klachtencoördinator registers and routes them (Oudewater, Haarlem; Portaal for corporations). https://www.woerden.nl/Documenten/Jaarverslagen_klachten/Jaarverslag_klachten_2023.pdf ; https://portaal.nl/media/5175/reglement-klachtencommissie-portaal-regio-eemland.pdf
- **[INFERENCE]** Low volume per organisation; fit is as an intake and routing step.

### 4.5 Huuraanvragen (row 6)

- **[FACT, summary]** The Autoriteit Persoonsgegevens says makelaars may ask for bank statements and payslips to check affordability, but often cannot explain why they ask so much. A Rotterdam protocol lists net income, contract or employer statement, payslips and bank statements. https://nos.nl/l/2576742 ; https://pl01.ogonline.nl/rotterdam-rental-service-media/Protocol%20for%20the%20Allocation%20of%20Rental%20Properties%20to%20Prospective%20Tenants.docx.pdf
- **[FACT, summary]** Corporations may ask for an inkomensverklaring only at toewijzing, not at inschrijving (Kassa, AP). https://www.bnnvara.nl/kassa/artikelen/woningbouwcorporaties-vragen-veel-te-vroeg-om-inkomensverklaring
- **[INFERENCE]** Extracting income fields is fine; scoring or ranking tenants carries discrimination and EU AI Act risk. Keep Vink to extraction and flags. **[GAP]** No NL source on minutes per applicant.

### 4.6 Garantie- en RMA-claims (row 7)

- **[FACT, summary]** Webshops and makers (Dometic, Zwilling, Action) ask for a form, proof of purchase and photos; Dometic cannot confirm warranty without valid proof. Knab: within 6 months the seller must prove the defect is not caused by the customer; after 6 months up to 2 years the burden is on the buyer. https://www.dometic.com/nl-be/support/garantieformulier ; https://bieb.knab.nl/ondernemen/omgaan-met-klachten-van-klanten-een-stappenplan-voor-ondernemers
- **[VENDOR]** Sendcloud sells RMA rules that approve or reject returns automatically. Emerce: many well-known shops still require a phone call. https://www.sendcloud.com/nl/blog/rma-betekenis/ ; https://www.emerce.nl/achtergrond/creer-ideale-online-rma
- **[GAP]** No Thuiswinkel.org or Dutch figure on warranty ticket volumes.

### 4.7 Other rows

- **Sollicitaties (row 8)**: Bullhorn, Klippa and Parseur sell CV parsing; most ATS have it built in. All vendor sources. https://www.bullhorn.com/nl/blog/staffing-tech-cv-parsing/ ; https://www.klippa.com/blog/informatief/cv-parsing
- **Hotels (row 9)**: RFP platforms exist (Proposales at Nordic Choice, MeetingPackage with Cvent, Backyou, Mews). No Dutch hotel evidence. **[GAP]** https://hoteltechreport.com/nl/meetings-and-events/hotel-rfp-software
- **Orderbevestigingen (row 10)**: Gasunie asks suppliers to confirm POs in the SAP Business Network; lines can be accepted or changed. No source on tolerance rules or on mailed PDF confirmations. **[GAP]** https://www.gasunie.nl/leveranciers/factuurafhandeling-gasunie/$697/$24664/Handleiding%20%E2%80%93%20PO%20bevestigen%20voor%20leveranciers%20Gasunie.pdf
- **Ledenaanmelding (row 11)**: Tennisclub HLTV Juliana asks for a filled-in form with photo by mail to the ledenadministratie. KNVB offers an online aanmeldformulier via Sportlink. KNBSB FAQ (2015) says no automatic link into Sportlink; data must be exported or typed. Old source. https://www.knvb.nl/assist-bestuurders/leden/aanmelden-van-leden ; https://www.knbsb.nl/media/uploads/knbsb/Verenigingsondersteuning/Sportlink/veelgesteldevragenledenadministratieimplementatiesportlink,versie2015-02-18.pdf
- **Inkoopfacturen (row 12), crowded [FACT]**: Basecone (Wolters Kluwer) uses OCR and AI to draft booking proposals and links to Twinfield, Exact Online, SnelStart and others. Billogram survey (27 June 2025): about 10% of MKB is ready for e-invoicing, 46% still send PDF invoices by mail, a quarter still receive paper invoices (sample size not stated). Exact MKB Barometer (4 June 2026): only 8% of SMEs use e-invoicing. https://www.wolterskluwer.com/nl-nl/experts/basecone ; https://www.mkbservicedesk.nl/nieuws/ondernemersnieuws/slechts-1-op-de-10-mkbers-klaar-voor-verplichte-e-facturatie-per-2026 (read) ; https://www.accountancyvanmorgen.nl/2026/06/04/mkbers-lopen-e20-000-mis-helft-weet-het-niet-eens/
  - **[GAP]** No source ranks Yuki, Exact or Twinfield by market share. **[GAP]** I did not confirm the date of any Dutch B2B e-invoicing mandate.
  - Conclusion: invoices are high-volume and still often by PDF, but the tools and accountants already serve them. Do not lead with it. **[INFERENCE]**

## 5. What I could not find

- **[GAP]** Independent (CBS, KVK, branch) data on how many orders, claims or applications arrive as PDF or mail and are retyped. Almost all evidence for row 1 is from sellers.
- **[GAP]** Minutes per claim, per application or per subsidy in the Netherlands.
- **[GAP]** Whether volmacht contracts allow automatic intake.
- **[GAP]** Thuiswinkel.org, Techniek Nederland (groothandel), NVM, ABU and Holland Metal/FME had no relevant public figure in what I could reach.
- **[GAP]** The Verbond 2025 report gives claim counts by type (fire, water, vehicle) but I found no split by channel (mail, portal, app).

## 6. Sources

Read in full or extracted: 
1. Verbond van Verzekeraars, Financieel jaarverslag verzekeringsbranche 2025: https://www.verzekeraars.nl/media/dzzfo0fd/financieel-jaarverslag-verzekeringsbranche-2025.pdf
2. Simplifai, Nh1816 case: https://www.simplifai.ai/case-studies/nh1816
3. Simplifai, Van Ameyde case: https://simplifai.ai/case-studies/van-ameyde
4. Simplifai, 112Schade news: https://simplifai.ai/news/simplifai-welcomes-dutch-customer-112schade-to-automate-claims-intake
5. WorkD, hidden cost of B2B orders by email (19 Feb 2026): https://www.workd.com/insights/articles/hidden-cost-managing-b2b-orders-email-2026/
6. Klippa, inkooporder proces: https://www.klippa.com/blog/informatief/inkooporder-proces/
7. MKB Servicedesk on e-invoicing readiness (27 June 2025): https://www.mkbservicedesk.nl/nieuws/ondernemersnieuws/slechts-1-op-de-10-mkbers-klaar-voor-verplichte-e-facturatie-per-2026
8. Banken.nl, Univé SchadeCheck (8 Aug 2025): https://www.banken.nl/nieuws/26336/unive-zet-ai-in-voor-snellere-schadeafhandeling-meer-ruimte-voor-persoonlijke-aandacht

Read through search summaries only (re-check before publishing):
9. Conexiom blog on manual order entry: https://conexiom.com/blog/the-real-cost-of-manual-order-entry-in-b2b-operations
10. Prodware sales-order agent (Dutch ERP vendor): https://www.prodwaregroup.com/nl-nl/wp-content/uploads/sites/11/2025/10/sales-order-agentdef.pdf
11. Distribution Strategy (2016): https://distributionstrategy.com/the-electronic-postman-always-rings-much-more-than-twice/
12. ABB NL orders: https://new.abb.com/low-voltage/nl/support/transparant-zaken-doen-met-abb/orders
13. Esker NL order processing: https://www.esker.com/nl/solutions/order-cash/customer-service/order-processing-automatisering
14. Fellowmind order intake agent: https://www.fellowmind.com/en/ai-agent-portfolio/order-intake-agent/
15. Incentro order intake agent: https://www.incentro.com/en-ID/services/order-intake-agent
16. Grimbergen Installaties EDI case: https://cloud01.topsite.nl/interfilter.nl/project/18/edi-klantcase-grimbergen-installaties-digitale-versie-1951.pdf
17. Orbitax, Netherlands e-order (Peppol): https://orbitax.com/news/country/article/Netherlands-looking-at-e-order_152b05db-5df6-11ef-b4db-366fb390559f
18. Adfiz, Advies in cijfers 2025: https://www.adfiz.nl/media/xkylrkq3/advies-in-cijfers-2025_digitaal-1.pdf
19. Verbond, Marktrapport volmachten 2025 H1 and 2024: https://www.verzekeraars.nl/media/gyldgvca/marktrapport-volmachten-2025-1e-halfjaar-def.pdf ; https://verzekeraars.nl/media/teofbrk5/marktrapport-volmachten-2024.pdf
20. Aegon aangifteformulier aansprakelijkheid: https://www.aegon.nl/system/files/2023-09/Aangifteformulier_aansprakelijkheidsverzekering.pdf
21. Allianz Direct autoschade stappenplan: https://www.Allianzdirect.nl/dam/documents/schade/Autoschade%20-%20Stappenplan.pdf
22. Kifid 2022-0505 and 2026-0097: https://www.kifid.nl/wp-content/uploads/2022/06/Uitspraak-2022-0505.pdf ; https://www.kifid.nl/media/feroyey5/uitspraak-2026-0097-bindend.pdf
23. Accountant.nl on Kifid complaints 2025: https://www.accountant.nl/nieuws/2026/4/kifid-krijgt-fors-meer-klachten-over-financiele-dienstverleners/
24. Shift Technology Shift Claims: https://www.shift-technology.com/en-gb/resources/press/shift-technology-unveils-agentic-ai-powered-shift-claims
25. Mobielschademelden.nl app (AutoRAI): https://autorai.nl/schade-melden-app-mobielschademelden/
26. Municipal subsidy forms: Ermelo, Weert, Zuidplas (URLs in 4.3); Leidschendam-Voorburg ASV: https://leidschendam-voorburg.debatrijk.nl/documents/11/917/documents/9508/ALGEMENE%20SUBSIDIEVERORDENING%20LEIDSCHENDAM-VOORBURG%C2%A0.pdf
27. Sira Woo research via Binnenlands Bestuur and Eerste Kamer (URLs in 4.4); Dinkelland jaarverslag bezwaarschriften 2024 (URL in 4.4)
28. Complaints: Woerden jaarverslag klachten 2023; Portaal klachtencommissie (URLs in 4.4)
29. AP and rental data: NOS https://nos.nl/l/2576742 ; Kassa https://www.bnnvara.nl/kassa/artikelen/woningbouwcorporaties-vragen-veel-te-vroeg-om-inkomensverklaring ; Rotterdam protocol (URL in 4.5)
30. Warranty/RMA: Dometic, Knab, Sendcloud, Emerce (URLs in 4.6)
31. Basecone: https://www.wolterskluwer.com/nl-nl/experts/basecone ; Exact MKB Barometer: https://www.accountancyvanmorgen.nl/2026/06/04/mkbers-lopen-e20-000-mis-helft-weet-het-niet-eens/
32. Bullhorn CV parsing: https://www.bullhorn.com/nl/blog/staffing-tech-cv-parsing/ ; Klippa CV parsing: https://www.klippa.com/blog/informatief/cv-parsing
33. Hotel RFP software overview: https://hoteltechreport.com/nl/meetings-and-events/hotel-rfp-software
34. Gasunie PO confirmation guide (URL in 4.7); KNVB and KNBSB member administration pages (URLs in 4.7)
