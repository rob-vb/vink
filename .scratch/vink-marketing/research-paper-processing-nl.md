# Papieren documenten in het Nederlandse MKB: kandidaten voor de Vink-demo

Date: 2026-10-09. Scope: sectors outside SBI section H, SBI 45 and SBI 77.1.

Legend: **[FACT]** = stated in the cited source. **[INFERENCE]** = my own reasoning, not stated by a source. **[GAP]** = I looked and found no good source.

## 1. Samenvatting (Nederlands, B1)

- Veel kleine bedrijven werken nog met papier. Dat geldt vooral voor werk buiten kantoor.
- Installateurs, schoonmakers, inspecteurs en uitzendbureaus krijgen papieren bonnen, lijsten en formulieren terug. Iemand typt ze later over.
- Techniek Nederland noemt zelf de problemen: papier raakt kwijt, handschrift is slecht leesbaar en overtypen is dubbel werk.
- Het MKB is groot en klein. In de bouwinstallatie zijn er ruim 42.000 vestigingen, in de schoonmaak bijna 28.000 (CBS, 1 januari 2026).
- Harde cijfers over "hoeveel papier" per sector zijn schaars. De meeste cijfers komen van softwareleveranciers. Wij markeren dat per bron.
- Beste demo-documenten: een onderhoudsrapport voor blusmiddelen (tabel, vinkjes, handtekening), een urenbriefje met twee handtekeningen, en een inschrijfformulier voor een zorgpraktijk.
- De installateur-werkbon is het sterkste verhaal qua bewijs. Die staat al in de demo, dus we gebruiken hem niet opnieuw.

## 2. Sectors table

Size column = CBS StatLine 81578NED "Vestigingen van bedrijven; bedrijfstak, regio", Nederland, 1 januari 2026 (provisional), SBI 2008. **[FACT]** Source: https://www.cbs.nl/nl-nl/cijfers/detail/81578NED (exact rows pulled via https://opendata.cbs.nl/ODataApi/odata/81578NED/TypedDataSet). "Vestigingen" includes one-person firms, so it overstates the number of real SMEs with staff. Whole-economy total: 2,616,915 vestigingen; construction (F) 274,650; specialised business services (M) 545,485; horeca section I 90,305.

| # | Sector (SBI) | Typical paper documents | Why paper persists | NL size (vestigingen, 1-1-2026) | Target system | Fit for Vink |
|---|---|---|---|---|---|---|
| 1 | Bouwinstallatie: elektro, loodgieters, cv (SBI 43.21, 43.22, 43.29) | Werkbon, opleverformulier, inbedrijfstellingformulier, afpersrapport, werkplekinspectie, opnameformulier | Work on site, customer signs on the spot. TN: paper gets lost, handwriting is hard to read, retyping is double work. Many own versions of the same form (see sources 1, 2) | 43.2 total 42,970 (elektro 21,095; loodgieters/installatie 18,705). All SBI 43: 145,365 | Installer ERP (e.g. Syntess named in TN deck), calculation/planning software, digital building file | High. Already in demo, so not a new demo candidate |
| 2 | Bouwafwerking: schilders, stukadoors, timmerbedrijven (SBI 43.3) | Werkbon, urenbriefje, meerwerkbon, opleverlijst | **[INFERENCE]** Same field-work pattern as row 1; mostly very small firms, little ERP | 64,840 | Accounting package (Exact, Moneybird, Twinfield) or small ERP | Medium-high. Close to the existing werkbon, so little new for the demo |
| 3 | Keuringsdiensten and onderhoud van veiligheidsmiddelen (SBI 71.2, 43.2x, 80.2x) | Keurings- and onderhoudsrapport (NEN 2559 blusmiddelen, NEN 3140 elektrisch materieel), inspectielijst per locatie, logboek | Inspector fills in on site, often offline; certificate or report must carry the inspector's signature. Customers (e.g. a transport company in a tender) ask for digital reports and a portal, which implies paper/Excel today **[INFERENCE]** | 71.2 keuringsdiensten: 2,855. Blusmiddelen firms have no own SBI row **[GAP]** | Asset or service software (e.g. onderhoud/CMMS), customer portal, Excel | High. Table of items, checkboxes, signature |
| 4 | Uitzendbureaus and arbeidsbemiddeling (SBI 78) | Urenbriefje / werkbriefje / tijdverantwoordingsformulier, signed by client and worker | Contract terms require signature by both parties; most agencies now offer digital approval, but paper stays at clients without portal access **[INFERENCE]** | SBI 78 total: 22,230 (includes bemiddeling and payroll). About 360,000 uitzendkrachten in Q4 2024 | Payroll/uitzendsoftware (hours to loon and factuur) | High. Weekly grid with handwritten numbers, two signatures |
| 5 | Schoonmaak and hoveniers (SBI 81.2, 81.3) | Urenstaat, kwaliteitsinspectie-formulier, werkbon per object, klachtenformulier | Many small firms (83% < 25 staff), high staff turnover, mobile workforce, shift work. No source found on paper itself **[GAP]** | 81.2: 27,925; 81.3: 16,655. Sector counts differ by source: CBS ~15,300 firms (2021) vs 3,519 pension-fund employers (2023) | Payroll/HR package, planning software, invoicing | Medium |
| 6 | Horeca: eet- en drinkgelegenheden (SBI 56) | HACCP temperatuur- and hygiënelijsten (KHN model forms), inkoopfacturen and bonnen, schoonmaaklijsten | KHN hygiënecode supplies printable registration forms; the owner chooses how to register. Administration firms say paper invoices and handwritten receipts remain | 76,645 | Bookkeeping package, HACCP app, Excel | Medium. Good visual (grid), weak "system" at the end |
| 7 | Administratie- and accountantskantoren (SBI 69.2) | Inkoopfacturen, bonnetjes, kasbladen from clients; aanvraagformulieren | Clients hand over a mix of paper, mail, WhatsApp, Excel. Source is an opinion column from 2018 **[FACT, weak]**; Dutch SME surveys show most invoicing still manual (see sources 9, 10) | 38,995 (accountancy, boekhouding, belasting) | Twinfield, Exact, Moneybird, Snelstart, AFAS | High, but the site already shows an invoice. Not a new candidate |
| 8 | Zorgpraktijken: huisarts, tandarts, fysio (SBI 86.21, 86.231, 86.912) | Inschrijf- / aanmeldformulier nieuwe patiënt, intakeformulier, machtiging, verwijsbrief | Many practices still offer a paper inschrijfformulier to collect at the desk or download; ID and zorgpas copy needed; law requires an ID check. Fax in healthcare has nearly disappeared (Faexit 90% goal reached end 2024) | 86.21 huisartsen 15,405; 86.231 tandartsen 11,750; 86.912 fysio 13,955 | HIS (huisarts), tandartssysteem, fysio-EPD | Medium-high on form, but special-category data and NEN 7510 raise trust and sales friction |
| 9 | Thuiszorg and welzijnswerk (SBI 88.101) | Urenregistratie, zorgdossier-notities, handtekening cliënt voor geleverde zorg | Care workers on the road; registration burden is high. 2024 Nivel: wijkverpleegkundigen are positive about digital care. No source on paper itself **[GAP]** | 33,860 | Zorgplanning/ECD, payroll | Low-medium. Sensitive data, long sales cycle |
| 10 | Veterinaire dienstverlening (SBI 75) | Inschrijf-/intakeformulier eigenaar and dier, vaccinatieboekje, toestemmingsformulier behandeling | **[INFERENCE]** Counter intake with the owner standing there. No Dutch source found **[GAP]** | 3,930 vestigingen; ABN AMRO estimates ~2,400 practices, ~20% in a chain | Dierenarts practice software | Low-medium. Small market |

Excluded on purpose (not in table): anything in SBI H (transport, storage, couriers), SBI 45, SBI 77.1, and the agricultural loonwerk sector (field machinery too close to vehicles).

### Evidence notes per row (source numbers refer to section 5)

- Row 1 **[FACT]**: Techniek Nederland "Samen Digitaal" workshop on forms (1 Dec 2022) lists: "Papier raakt kwijt", "Papier blijft te lang liggen", "Vlekken en vocht", "Leesbaarheid handschriften", "Overtypen is dubbel werk". It also says "ongeveer iedereen z'n eigen versie van 't zelfde formulier heeft". Source 2. The March 2025 webinar says a survey found a majority not satisfied with their digital position, with administration, reporting and calculation as focus areas, and lists forms to digitise: opnameformulier, inbedrijfstellingformulier, afpersen tussentijds en eindcontrole, opleverformulier, werkplekinspectie, audit. Source 1. Techniek Nederland counted turnover of almost EUR 36 billion in 2024 and about 195,000 working people (secondary report). Source 4.
- Row 3 **[FACT]**: A GVB tender (2026) asks for a zero measurement under NEN 2559/NEN 4001 recording type, class, number, placement, physical state and inspection status per location, plus digital reporting with a portal. Source 12. Kiwa describes a NEN 3140 inspection as visual checks, measurements and tests with a report afterwards. Source 13. **[INFERENCE]** The tender fields are the best proxy for the table a paper report would carry.
- Row 4 **[FACT]**: One agency's terms say invoices are based on "geaccordeerde (digitale) tijdverantwoordingsformulieren", approval by (digital) signature, and both client and worker must sign. Source 14. **[FACT]** Hours of uitzendwerk fell 8% in 2024 (ABU via ANP). Source 15. **[INFERENCE]** The shift to digital approval is why this is a medium-sized paper problem, not a huge one.
- Row 5 **[FACT]**: OSB/RAS data: 83% of firms are small (< 25 staff, < EUR 5 m turnover), over 30,000 staff leave the sector each year. Source 16.
- Row 6 **[FACT]**: KHN provides model forms for temperature registration, thermometer tests and periodic hygiene checks, and says the owner decides how to register; registrations must be kept 6 months to 1 year. Source 17. Moore DRV (commercial) says paper invoices and handwritten receipts remain after e-invoicing and can be scanned with a phone photo. Source 18.
- Row 7 **[FACT]**: Exact MKB Barometer, 4 June 2026, 900+ entrepreneurs: only 8% of SMEs use e-invoicing; 47% send invoices by post or mail without payment link. This is about outgoing invoices. Source 9. A Ricoh/PanelWizard survey (date not stated, vendor-sponsored) says 66% of SMEs handle invoices mainly by hand, about 40 hours per month. Source 10. CBS 2018 data: 24% of invoices on paper (down from 50% in 2016); small firms are less digitalised. Sources 7, 8 (old).
- Row 8 **[FACT]**: Practice sites (Duivendrecht, Zoeterwoude, Heelhoek) still offer a paper form to collect or download and ask for ID and zorgpas copies; Heelhoek cites the legal duty to check identity of newly registered patients since 2007. Source 19. Faexit: the fax was ~10 million messages a year in 2021; the 90% fax-free goal was reached end 2024. Source 20.
- Row 10: ABN AMRO 2025 estimate of ~2,400 practices. Source 21.

### What I could not find

- **[GAP]** A CBS "ICT-gebruik bij bedrijven" figure for 2024/2025 on paper versus e-invoices by sector. StatLine tables exist (CBS lists 2025 tables), but I could not open them. The newest invoice split I could read is from 2018 (source 7).
- **[GAP]** Any Bouwend Nederland or KVK number on paper urenbriefjes, bonnen or werkbonnen. The KVK digitalisation study (956 entrepreneurs) says 73-80% have digital financial administration, but the date is not shown in what I read and it is not about paper. Source 11.
- **[GAP]** Dutch surveys on paper in schoonmaak, thuiszorg, dierenartsen, kinderopvang. Several vendor claims exist but are US or Belgian.
- Harvest's "40% of construction firms still use paper (2018)" has no named source; I did not use it.

## 3. Top 3 candidates for the new website demo document

Rules used: no sector from H, 45, 77.1; no deliveries, vehicles, drivers or tyres; not the installer werkbon, not the espresso complaint email, not an invoice. Handwriting, table, signature and mixed print plus handwriting are the features to show. All names, numbers and BSNs in the demo must be invented.

### Candidate 1 (recommended): Onderhoudsrapport blusmiddelen, handgeschreven op klembord

- **Document**: A one-page A4 "Onderhoud- en keuringsrapport blusmiddelen" from a brandveiligheidsbedrijf. Printed header and column titles. The monteur fills 6-8 rows by hand and ticks boxes. Photo taken on a desk or clipboard, a bit skewed.
- **Fields** (header): Klant, Locatie / adres, Datum onderhoud, Monteur, Volgende keuring (maand/jaar).
- **Fields** (table rows): Plaats (e.g. "Entree magazijn"), Type (schuim / poeder / CO2), Inhoud (kg or liter), Serienummer, Bouwjaar, Goedgekeurd (ja/nee), Opmerking (e.g. "manometer vervangen").
- **Fields** (bottom): Handtekening monteur, Handtekening klant, "Afgekeurd: aantal" total.
- **Why it shows Vink well**:
  - It is a real table, so it shows Vink turning rows on paper into a list of entries.
  - It mixes print (columns) with handwriting (values).
  - It has checkboxes and a signature field.
  - The data goes to a different kind of system (asset or service software), which broadens the story beyond ERP.
- **Evidence**: tender requirements for the same record fields (source 12); NEN 3140/NEN 2559 inspection context (sources 12, 13). **[INFERENCE]** that real firms still use paper copies. **Check before use**: no source confirms how many maintenance firms are paper-based; I found no sector count.

### Candidate 2: Urenbriefje (weekstaat) met handtekening van opdrachtgever

- **Document**: A weekly "Urenbriefje" from an uitzendbureau or schoonmaakbedrijf. Rows Monday to Sunday, handwritten start, end, pause and total hours per day. Two signatures at the bottom: medewerker and opdrachtgever. Maybe a stamp of the client.
- **Fields**: Naam medewerker, Personeelsnummer, Opdrachtgever, Weeknummer, Per dag: Datum, Van, Tot, Pauze (min), Totaal uren; Weektotaal, Handtekening medewerker, Handtekening opdrachtgever (and "Goedgekeurd" tick).
- **Why it shows Vink well**:
  - Handwritten digits in a grid (hard OCR case, the obvious wow moment).
  - Two signatures, which Vink can detect as "present/absent" fields.
  - The totals can be cross-checked against the daily rows, so the review screen can flag a mismatch.
  - Data goes to payroll and invoicing software.
- **Evidence**: signed time-sheet practice in agency terms (source 14); sector size (SBI 78: 22,230 vestigingen). **Caution**: it is close to a werkbon in spirit (hours), so keep the layout visibly different (grid, no materials list). Many agencies already offer digital approval **[FACT, source 14]**, so avoid claiming "all agencies use paper".

### Candidate 3: Inschrijfformulier nieuwe patiënt (tandarts, fysiotherapeut of huisarts)

- **Document**: A printed "Inschrijfformulier" with boxes per letter, filled in by hand in block letters. A photocopy of a zorgpas stapled on top. Tick boxes for "dhr./mevr." and "toestemming gegevens delen".
- **Fields**: Achternaam, Voorletters, Geboortedatum, Adres + postcode + woonplaats, Telefoon, E-mail, Zorgverzekeraar, Polisnummer, Vorige huisarts/tandarts, Handtekening + datum.
- **Why it shows Vink well**:
  - It is mixed print and handwriting in boxes (a different handwriting style than the installer's free text).
  - It has checkboxes and a signature.
  - It shows a "form in, structured record out" story with a clear customer outcome (one record in the practice system, no retyping at the front desk).
- **Evidence**: practices still offer paper forms (source 19). Sector sizes: 15,405 / 11,750 / 13,955 vestigingen.
- **Cautions**: the data is health-related and includes insurer and ID details, so use obviously invented data. Selling to care has NEN 7510 questions **[FACT]** (source 23: the LHV says care organisations must meet NEN 7510). Vink's own GDPR paperwork is not final, so keep this as a demo only, not a target sector.

### Runner-up

- **HACCP temperatuurlijst (horeca)**: grid of days by fridge with handwritten temperatures and initials, based on the KHN model form (source 17). Strong visual, but the "system" at the end is weak.

## 4. Quick recommendation

Use candidate 1 for the demo (clearest table plus signature, new data target, no overlap). Use candidate 2 as the second demo document if there is room (strongest handwriting showcase). Keep candidate 3 for a "forms" use-case page, not the hero demo.

## 5. Sources

1. Techniek Nederland, webinar "Samen Digitaal", 18 March 2025 (PDF): https://www.technieknederland.nl/media/fekltfbl/presentatie-webinar-samen-digitaal-18-maart-2025.pdf
2. Techniek Nederland, Samen Digitaal workshop on forms, 1 Dec 2022 (concept text; PDF behind the leden domain): https://technieknederland.nl/stream/techniek-nederland-samen-digitaliseren-formulieren-01-12-2022 (redirects to https://leden.technieknederland.nl/stream/techniek-nederland-samen-digitaliseren-formulieren-01-12-2022)
3. CBS StatLine 81578NED, vestigingen per bedrijfstak (1 Jan 2026): https://www.cbs.nl/nl-nl/cijfers/detail/81578NED ; OData: https://opendata.cbs.nl/ODataApi/odata/81578NED/TypedDataSet
4. Solar Magazine, omzet installatiebedrijven EUR 36 miljard (secondary, from Techniek Nederland): https://solarmagazine.nl/nieuws-zonne-energie/i42979/omzet-nederlandse-installatiebedrijven-stijgt-naar-36-miljard-euro
5. CBS, "4. Bedrijven en instellingen", De Nederlandse economie in 2025: https://www.cbs.nl/nl-nl/longread/de-nederlandse-economie/2026/de-nederlandse-economie-in-2025/4-bedrijven-en-instellingen (business dynamics only)
6. CBS table "Bedrijven; bedrijfstak (SBI 2025)" (listed, not opened): https://www.cbs.nl/nl-nl/cijfers/detail/86280NED
7. CBS, Kleinere bedrijven minder gedigitaliseerd (2020, data 2018/2019): https://www.cbs.nl/nl-nl/nieuws/2020/08/kleinere-bedrijven-minder-gedigitaliseerd
8. CBS ICT-gebruik bij bedrijven (overview, tables for 2025 exist): https://www.cbs.nl/nl-nl/deelnemers-enquetes/bedrijven/overzicht-bedrijven/ict-gebruik-bij-bedrijven
9. Accountancy Vanmorgen, Exact MKB Barometer, 4 June 2026: https://www.accountancyvanmorgen.nl/2026/06/04/mkbers-lopen-e20-000-mis-helft-weet-het-niet-eens/
10. Ricoh/PanelWizard survey on SME invoicing (undated, vendor-sponsored), as summarised by Computable: https://computable.nl/?p=182739
11. KVK, "Digitalisering: Wie pakt de kansen?" (via KVK press pages): https://www.kvk.nl/pers/kvk-gebrek-aan-tijd-en-kennis-remt-online-ondernemen/
12. GVB tender document (blusmiddelen nulmeting, digital reporting), TenderNed: https://www.tenderned.nl/papi/tenderned-rs-tns/v2/publicaties/413032/documenten/13776728/content
13. Kiwa, NEN 3140 keuring: https://www.kiwa.com/nl-be/nl/diensten/inspectie/nen-3140-keuring/ ; Kiwa REOB (onderhoud blusmiddelen): https://www.kiwa.com/nl/nl/diensten/certificering/onderhoud-blusmiddelen-reob/
14. Agency terms on signed tijdverantwoordingsformulieren (Law Insider) and Please Payroll/Signhost digital approval: https://www.lawinsider.com/nl/contracts/bePUNzfdWWM ; https://signhost.com/uploads/Please_Payroll_dd179b7d0b.pdf
15. UWV on uitzendkrachten and agencies (CBS Q4 2024); ABU hours via ANP: https://www.uwv.nl/nl/arbeidsmarktinformatie/flexibele-arbeid/minder-mensen-uitzendkracht-na-ww ; https://www.welingelichtekringen.nl/economie/vraag-naar-uitzendkrachten-loopt-verder-terug
16. Schoonmaak sector data: RAS actualisatie sectoranalyse 2023: https://ras.nl/wp-content/uploads/2023/06/Actualisatie-sectoranalyse-2023-DEF.pdf ; RAS sectoranalyse 2021: https://www.ras.nl/wp-content/uploads/2021/07/RAS-sectoranalyse-2021.pdf
17. KHN, registratie temperaturen and Hygiënecode model forms: https://khn.nl/kennis/registratie-temperaturen ; https://khn.nl/kennis/registratielijst-periodieke-hygienecontrole ; KVK on HACCP: https://www.kvk.nl/starten/voedselveiligheid-in-de-horeca-alles-over-haccp/
18. Moore DRV, administratie horeca (commercial): https://www.moore-drv.nl/oplossingen/administratie-horeca/ ; SRA, Belastingdienst tool voor horeca (Nov 2025): https://www.sra.nl/nieuws/004501/2025/11/nieuwe-tool-voor-horeca-bij-administratie
19. Practice inschrijfformulier pages: https://huisartsduivendrecht.praktijkinfo.nl/inschrijven-in-de-praktijk/ ; https://huisartszoeterwoude-rd.praktijkinfo.nl/praktijkinformatie ; https://huisartsenpraktijkheelhoek.uwartsonline.nl/wp-content/uploads/sites/1243/2022/09/Inschrijfformulier-1.pdf
20. ICT&health, Eindelijk van de fax af (2025): https://www.icthealth.nl/magazine/editie-1-2025/eindelijk-van-de-fax-af ; Faexit vooronderzoek 2021: https://www.zorgring.nl/wp-content/uploads/2022/02/2021-0921-Faexit-vooronderzoek-def.pdf
21. ABN AMRO, Trends voor dierenartsen 2025: https://www.abnamro.nl/nl/zakelijk/speciaal-voor/medici/trends-in-de-zorg/dierenarts.html
22. RVO spiegelonderzoek energielabels (2022): https://www.rvo.nl/sites/default/files/2022/04/spiegelonderzoek-energielabels.pdf ; NHG model bouwkundig rapport 2024: https://www.NHG.nl/media/ag1buavr/v-n-2024-1-model-bouwkundig-rapport-nhg.pdf
23. LHV, informatiebeveiliging and NEN 7510: https://www.lhv.nl/wp-content/uploads/2023/12/DD2307_18-21-Informatiebeveiliging.pdf
24. De Zaak, "Geen papieren werkbonnen" (partner content, updated 11 Jan 2024; names bouw, schoonmaak, onderhoud, agrarisch as field-service sectors): https://www.dezaak.nl/partner-content/geen-papieren-werkbonnen-kies-voor-een-automatische-urenregistratie/
25. Nivel, Monitor Digitale Zorg 2024: https://www.nivel.nl/sites/default/files/bestanden/13280.pdf
26. Wkb opleverdossier (a paper folder or PDF is also acceptable), via ABN AMRO: https://www.abnamro.nl/nl/zakelijk/insights/sectoren-en-trends/bouw/wet-kwaliteitsborging-voor-het-bouwen-regeren-is-vooruitzien.html

Caveat on sources: searches returned summaries, not always the full page. Sources 12, 14, 15, 16, 19, 20, 21, 22, 23, 25 and 26 were read through search summaries only; their quotes should be checked on the page before they go on a public site. Sources 1, 2, 3, 7 and 9 were read directly.
