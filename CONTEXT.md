# Vink

Multi-tenant SaaS that reads documents (PDF, incl. handwritten), extracts their data into user-defined Forms, and — after approval — sends it to external systems via Integrations.

## Language

**Organisation**:
The customer company that uses Vink. It owns its Forms, Integrations and Documents, and its data is never visible to another Organisation.
_Avoid_: tenant, workspace, account

**Membership**:
A user's place in an Organisation, with a role: Admin (manages Forms, Integrations, thresholds and users) or Member (uploads, reviews and approves Documents). One user can have Memberships in several Organisations.

**Form**:
A user-defined set of Fields describing one kind of document.
_Avoid_: template, schema

**Field**:
A typed slot on a Form. It has a label (shown to users), a key (its name in the Payload), a type (text, number, date, boolean, choice, or list), an optional description that guides extraction, and a required flag.
_Avoid_: attribute, column

**List Field**:
A Field that holds any number of entries, each made up of the same sub-Fields (for example, one entry per changed tyre, or per invoice line). Sub-Fields are never lists themselves.
_Avoid_: table, repeating group

**Form Version**:
A frozen state of a Form's Fields. A Document is processed and sent according to the Form Version that was current when it was uploaded.

**Form Proposal**:
A draft set of Fields that Vink proposes from one sample PDF, before it is a Form (or before it is added to one). It holds the sample, its Reading and the proposed Fields. An Admin edits it and saves it as a Form Version, and the sample can then become that Form's first Document. An unsaved Form Proposal is deleted after 7 days.
_Avoid_: template, template agent, form suggestion

**Document**:
An incoming file (PDF) to be processed against one Form. All its pages together fill one set of Field Values; a PDF is never split into several Documents.
_Avoid_: upload, file

**Extraction**:
One run that turns a Document into Field Values for its Form Version, in four steps: Read, Match, Fill and verify. It can fail (Extraction Failed) and then be started again by hand; a new run never overwrites a user's corrections.
_Avoid_: OCR, parse, scan

**Reading**:
A clean JSON description of everything a Document says, written by the vision model without knowing any Form: one object per real-world thing (a tyre change, an invoice line), with duplicates across bundled papers merged, conflicting readings kept side by side, and the pages each fact came from. It is stored with the Document and never sent.
_Avoid_: OCR output, transcript, raw extraction

**Match**:
The step where Jev decides, per Field, which part of the Reading holds it (a path, or for a List Field an array and its keys), with a probability. Choosing another Form re-runs Match and Fill on the same Reading.
_Avoid_: mapping (that word belongs to Integrations, see below)

**Fill**:
The step where a small text model writes each Field Value from the source Match picked, in the form the Field asks for. It never adds anything that isn't in that source.

**Field Value**:
The value assigned to a Field for a given Document. It carries a confidence score, the text as it was read on the Document, its source in the Reading, and the page(s) it was found on. In a List Field, each sub-Field of each entry has its own Field Value, and the List Field has one more confidence that says whether all entries were found.

**Confidence**:
A score from 0 to 1 on a Field Value (and on a List Field's completeness) that ranks how likely it is to be right. It is a ranking, not a probability: 0.9 does not mean "90% chance". It is the lowest of the signals available for that value.
_Avoid_: certainty, probability, percentage

**Review Threshold**:
A confidence (0–1) set per Form, 0.8 by default. A Field Value whose confidence is below it is Needs Review.

**Needs Review**:
Status of a Field Value that a user must check: its confidence is below the Review Threshold, it is required and empty, it doesn't fit its Field's type, or the Reading marks its source as unsure or conflicting. A List Field is also Needs Review when its completeness confidence is below the Review Threshold.

**Auto-Send**:
A per-Form switch, off by default. When it is on, a Document whose Extraction has just succeeded is approved automatically if nothing on it is Needs Review, Jev has verified it, and no user has corrected it, changed its Form or reopened it yet.
_Avoid_: Auto-Send Threshold, auto-approve

**Approval**:
The go-ahead that a Document's Field Values are correct — given by a user, or automatically through Auto-Send. It sends the Payload to every Integration attached to the Form; with no Integration attached, nothing is sent.

**Rejected**:
End state of a Document that a user has ruled unusable (blank, unreadable, or not this kind of document) before Approval. A Rejected Document is never approved or sent, stays visible in the Document list with who rejected it, when and an optional reason, and can be reopened while its PDF is still kept. Only an Admin can delete a Rejected Document outright.
_Avoid_: declined, archived, deleted

**Payload**:
The JSON built from a Document's Field Values, keyed by the Form's Fields.

**Integration**:
An external endpoint that receives a Payload by HTTP POST. It belongs to the Organisation and can be attached to several Forms.
_Avoid_: koppeling, connector

**Delivery**:
One attempt-series to send one Document's Payload to one Integration. It is pending, retrying, delivered or failed, and a failed Delivery can be sent again by hand. A test-send is not a Delivery.
_Avoid_: webhook call, send

## Relationships

- An **Extraction** writes one **Reading** per **Document**; **Match** and **Fill** turn it into **Field Values** for the Document's **Form Version**
- An **Organisation** owns its **Forms**, **Integrations** and **Documents**; users reach them only through a **Membership**
- A **Document** is processed against exactly one **Form**, chosen by the user at intake
- A **Form** has many **Fields**; each **Document** yields one **Field Value** per **Field** (per sub-Field per entry for a **List Field**)
- A **Field Value** below the Form's **Review Threshold** is **Needs Review**. So is a required Field without a value, and a value that doesn't fit its Field's type.
- **Auto-Send** approves a **Document** only when none of its **Field Values** is **Needs Review**
- A **Form Proposal** is made from one sample's **Reading** and becomes a **Form Version** when an Admin saves it
- A **Document** belongs to exactly one **Form Version**. Editing a Form creates a new version and leaves existing Documents alone.
- A **Payload** reaches an **Integration** only after **Approval**
- An **Integration** is attached to one or more **Forms**; a **Form** can have several **Integrations**
- **Approval** of a **Document** creates one **Delivery** per **Integration** attached to its **Form**
- Before **Approval**, a user can move a **Document** to another **Form** (it takes that Form's current **Form Version**, and **Match** and **Fill** run again on its **Reading**) or mark it **Rejected**; after **Approval**, neither is possible

## Flagged ambiguities

- "koppeling" was used for both the Integration and the act of mapping Fields — resolved: **Integration** is the endpoint; the Payload is keyed by the Form's own Fields, so there is no separate mapping step in this version. Deciding which part of a Document belongs to which Field is **Match**, not mapping.
