# Field model

Type: grilling
Status: resolved
Blocked by: 

## Question

What does a Field consist of in v1? Which Field types (text, number, date, enum, boolean, …), per-Field description/instructions for extraction, required vs optional, validation rules, and — crucially — repeating groups (multiple tyres per report, invoice line items). How does a repeating group appear in the Payload JSON?

## Comments

**2026-09-23 (from Test document set):** Real tyre Documents contain several changed tyres per service, so the provisional `fixtures/forms/tire-service.json` uses a repeating `list` Field with sub-Fields. The Field model must decide whether repeating groups are in v1.

## Answer

Settled with the user on 2026-09-23. Terms are recorded in `CONTEXT.md` (Field, List Field, Form Version, Field Value).

- **Field types:** `text`, `number`, `date`, `boolean`, `choice` and `list`. An amount is a `number`, with the currency as a separate Field. More types can be added later without breaking anything.
- **List Field:** repeating groups are in v1, one level deep. A List Field has sub-Fields, and sub-Fields are never lists themselves.
- **Each Field has:**
  - a label, shown to users and free text in any language;
  - a key, the Payload name, derived from the label and editable, but fixed once an Integration is attached to the Form;
  - a type;
  - an optional description that guides extraction;
  - a required flag.

  A Form also has an optional description.
- **`choice` options:** each option has a value plus an optional description (synonyms, other languages) that guides the mapping.
- **Validation in v1:** by type only (a number parses, a date is ISO, a `choice` value is one of the options). If a value doesn't fit, it becomes `null`, the read text stays, and the Field is Needs Review. There are no regex, min/max or cross-Field rules. Plausibility checks come from Jev per Field, and cross-Field rules can follow later.
- **Required:** a required Field without a value is always Needs Review, whatever its confidence, so it blocks Auto-Send and never raises a hard error. A required List Field needs at least one entry. A required sub-Field must have a value in every entry.
- **Confidence:** every Field Value has its own confidence, which means one per sub-Field per entry in a List Field. A List Field also carries one completeness confidence ("were all entries found, and none invented?"). If that is too low, the List Field is Needs Review. In review, users can add and remove entries.
- **Read text:** every Field Value stores the text as it was read on the Document next to its normalised value. It is shown in review and never goes into the Payload.
- **Payload:** every key is always present, and `null` means no value (at the top level and inside entries). A List Field becomes an array of objects keyed by the sub-Field keys, and `[]` when no entries were found. Dates are ISO strings, and a `choice` holds the option's value.
- **Form Version:** editing a Form creates a new version. A Document is processed and sent according to the Form Version that was current at upload.

No ADR was written. None of these calls is hard to reverse and surprising at the same time.
