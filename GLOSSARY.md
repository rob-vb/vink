# Vink

Multi-tenant SaaS that reads any input (PDF, email or photo, incl. handwritten), picks the Form it belongs to, extracts its data into that user-defined Form, and — after approval — sends it to external systems via Integrations.

## Language

**Organisation**:
The customer company that uses Vink. It owns its Forms, Integrations and Submissions, and its data is never visible to another Organisation.
_Avoid_: tenant, workspace, account

**Membership**:
A user's place in an Organisation, with a role: Admin (manages Forms, Integrations, thresholds and users) or Member (uploads, reviews and approves Submissions). One user can have Memberships in several Organisations.

**Form**:
A user-defined set of Fields describing one kind of document.
_Avoid_: template, schema

**Field**:
A typed slot on a Form. It has a label (shown to users), a key (its name in the Payload, in snake_case), a type (text, number, date, boolean, choice, or list), an optional description that guides extraction, and a required flag.
_Avoid_: attribute, column

**List Field**:
A Field that holds any number of entries, each made up of the same sub-Fields (for example, one entry per delivery note line, or per invoice line). Sub-Fields are never lists themselves.
_Avoid_: table, repeating group

**Form Version**:
A frozen state of a Form's Fields. A Submission is processed and sent according to the Form Version that was current when it was uploaded.

**Form Proposal**:
A draft set of Fields that Vink proposes, before it is a Form (or before it is added to one). It starts from one sample (a PDF, a photo or an email) or from a description in words. It holds the sample if there is one, its Reading and the proposed Fields. An Admin edits it and saves it as a Form Version, and the sample can then become that Form's first Submission. An unsaved Form Proposal is deleted after 7 days.
_Avoid_: template, template agent, form suggestion

**Submission** (nl: Inzending):
An incoming PDF, email or image, processed against at most one Form. All its pages together fill one set of Field Values; a PDF or an image is never split into several Submissions. Jev decides whether an email becomes one Submission or several; when unsure it splits the email and marks the Submissions Needs Review. A Submission that no Form fits is in No Form. The page that lists them is the Inbox.
_Avoid_: Document, upload, file, Stuk, Record, Bericht

**Inbox**:
The app page that lists an Organisation's Submissions, shown to users as Submissions. It is a page, not an email address: email reaches Vink through an Intake Address.
_Avoid_: Submissions page, Submissionen

**Form Intake Address**:
An email address that belongs to one Form: each email sent to it becomes one or more Submissions of that Form, and the Router does not run. Anyone who knows the address can send to it, so it is treated as a secret: an Admin switches it on and can replace it, which stops the old address at once. Vink never replies to the sender; an attachment of another file type, one that is too long, or one over the Organisation's Items is refused and creates no Submission.
_Avoid_: inbox, mailbox, email-in address

**Organisation Intake Address**:
An email address that belongs to the Organisation, next to the Form Intake Addresses. Each email sent to it becomes one or more Submissions without a Form, and the Router picks the Form for each. It is a secret in the same way as a Form Intake Address: an Admin switches it on and can replace it. Vink never replies to the sender.
_Avoid_: inbox, mailbox, catch-all address

**Item**:
One unit of input that Vink reads. It is the unit in which an Organisation's usage and Plans are measured: 1 PDF page, 1 email or 1 photo is 1 Item, so a 10-page PDF counts as ten. An email counts its parts: its text 1 (unless Jev judges it only a cover note for the attachments), each attached PDF its pages, each attached image 1; small inline signature images are dropped and do not count. Every Item counts, including those of Submissions in No Form. An Item counts once, when Vink reads the input (a Submission or a Form Proposal sample); a retry, a move to another Form, or the sample becoming a Submission does not count again.
_Avoid_: credit, unit, Page

**Plan**:
What an Organisation pays for: a number of Items per billing period. Every Plan has the same features and unlimited users; unused Items expire at the end of the period. When the Items run out, new uploads are refused until the Organisation upgrades or buys a Top-up.
_Avoid_: tier, subscription, package

**Free Items**:
A one-time number of Items given to the first Organisation a user creates, to try Vink before choosing a Plan. They never renew or expire.
_Avoid_: trial, free tier, free plan

**Top-up**:
Extra Items bought once on top of a Plan, valid until the end of the current billing period.
_Avoid_: add-on, overage

**Extraction**:
One run that turns a Submission into Field Values for its Form Version, in four steps: Read, Match, Fill and verify. A Submission that came without a Form gets the Router between Read and Match. It can fail (Extraction Failed) and then be started again by hand; a new run never overwrites a user's corrections.
_Avoid_: OCR, parse, scan

**Reader**:
The Read step, chosen by the Submission's MIME type and not by AI: the PDF reader gets every page image plus the text layer; the image reader gets the image, which has no text layer, so verify skips the check against the text; the email reader gets the headers and body as text and the attachments as extra parts, and verify treats the body as one page.
_Avoid_: OCR engine, parser

**Router**:
The step where Jev picks the Form for a Submission that has none, from its Reading and the name and description of each of the Organisation's Forms. Match and the fit check then decide whether the picked Form really fits; if not, the Submission goes to No Form. The fit check runs also when the Organisation has only one Form. The Router does not run when the Form is already known: chosen by a user at upload, in the API request, or by a Form Intake Address.
_Avoid_: classifier, sorter

**No Form**:
The state of a Submission that no Form fits, or that came in without a Form and the Router found none. It stays visible in its own list and counts its Items, but it has no Field Values, is never approved or sent, and can be moved to a Form or marked Rejected.
_Avoid_: unmatched, unassigned, inbox

**Reading**:
A clean JSON description of everything a Submission says, written by the vision model without knowing any Form: one object per real-world thing (a delivered item, an invoice line), with duplicates across bundled papers merged, conflicting readings kept side by side, and the pages each fact came from. It is stored with the Submission and never sent.
_Avoid_: OCR output, transcript, raw extraction

**Match**:
The step where Jev decides, per Field, which part of the Reading holds it (a path, or for a List Field an array and its keys), with a probability. Choosing another Form re-runs Match and Fill on the same Reading.
_Avoid_: mapping (that word belongs to Integrations, see below)

**Fill**:
The step where a small text model writes each Field Value from the source Match picked, in the form the Field asks for. It never adds anything that isn't in that source.

**Field Value**:
The value assigned to a Field for a given Submission. It carries a confidence score, the text as it was read on the Submission, its source in the Reading, and the page(s) it was found on. In a List Field, each sub-Field of each entry has its own Field Value, and the List Field has one more confidence that says whether all entries were found.

**Confidence**:
A score from 0 to 1 on a Field Value (and on a List Field's completeness) that ranks how likely it is to be right. It is a ranking, not a probability: 0.9 does not mean "90% chance". It is the lowest of the signals available for that value.
_Avoid_: certainty, probability, percentage

**Review Threshold**:
A confidence (0–1) set per Form, 0.8 by default. A Field Value whose confidence is below it is Needs Review.

**Needs Review**:
Status of a Field Value that a user must check: its confidence is below the Review Threshold, it is required and empty, it doesn't fit its Field's type, or the Reading marks its source as unsure or conflicting. A List Field is also Needs Review when its completeness confidence is below the Review Threshold.

**Auto-Send**:
A per-Form switch, off by default. When it is on, a Submission whose Extraction has just succeeded is approved automatically if nothing on it is Needs Review, Jev has verified it, and no user has corrected it, changed its Form or reopened it yet.
_Avoid_: Auto-Send Threshold, auto-approve

**Approval**:
The go-ahead that a Submission's Field Values are correct — given by a user, or automatically through Auto-Send. It sends the Payload to every Integration attached to the Form; with no Integration attached, nothing is sent.

**Rejected**:
End state of a Submission that a user has ruled unusable (blank, unreadable, or not this kind of document) before Approval. A Rejected Submission is never approved or sent, stays visible in the Submission list with who rejected it, when and an optional reason, and can be reopened while its file is still kept. An Admin can delete any Submission's data outright, Rejected or not.
_Avoid_: declined, archived, deleted

**Payload**:
The JSON built from a Submission's Field Values, keyed by the Form's Fields.

**Integration**:
A destination outside Vink that receives Payloads after Approval. Its kind says how: a Webhook posts the Payload to an endpoint; a spreadsheet kind (Google Sheets, Excel) writes it into a sheet. It belongs to the Organisation and can be attached to several Forms.
_Avoid_: koppeling, connector

**Webhook**:
The Integration kind that sends a Payload by HTTP POST to an external endpoint, signed so the receiver can check it came from Vink. Zapier, Make, n8n and Power Automate can receive it. A Webhook is made by an Admin, or by a Subscription.
_Avoid_: callback, hook

**API Key**:
A named secret an Admin makes for the Organisation, so a program can use Vink without a user: send in Submissions, read a Submission's state and, after Approval, its Payload, and manage Subscriptions. It is shown once, and an Admin can revoke one key without touching the others.
_Avoid_: token, access key

**Subscription**:
A request from an automation platform (Zapier, Make), made with an API Key, to hear about Approvals of one Form. It creates a Webhook attached to that Form; ending the Subscription removes that Webhook.
_Avoid_: hook, trigger registration

**Delivery**:
One attempt-series to send one Submission's Payload to one Integration. It is pending, retrying, delivered or failed, and a failed Delivery can be sent again by hand. A test-send is not a Delivery.
_Avoid_: webhook call, send

## Relationships

- An **Extraction** writes one **Reading** per **Submission**; **Match** and **Fill** turn it into **Field Values** for the Submission's **Form Version**
- An **Organisation** owns its **Forms**, **Integrations** and **Submissions**; users reach them only through a **Membership**
- An **Organisation** has at most one **Plan**; without one it runs on its **Free Items**, if it got any
- A **Submission** is processed against at most one **Form**: chosen by the user at upload, by the **Form Intake Address** it was sent to, or in the API request that sent it in; otherwise picked by the **Router**. If none fits, it is in **No Form**.
- A **Form** has at most one **Form Intake Address**; an **Organisation** has at most one **Organisation Intake Address**, and mail sent to it goes through the **Router**
- The **Reader** is chosen by a **Submission**'s kind (PDF, email or image); every kind yields a **Reading**
- Every **Item** counts when its input is read, whether the **Submission** ends in a **Form** or in **No Form**
- A **Form** has many **Fields**; each **Submission** yields one **Field Value** per **Field** (per sub-Field per entry for a **List Field**)
- A **Field Value** below the Form's **Review Threshold** is **Needs Review**. So is a required Field without a value, and a value that doesn't fit its Field's type.
- **Auto-Send** approves a **Submission** only when none of its **Field Values** is **Needs Review**
- A **Form Proposal** is made from one sample's **Reading** and becomes a **Form Version** when an Admin saves it
- A **Submission** with a **Form** belongs to exactly one **Form Version**. Editing a Form creates a new version and leaves existing Submissions alone.
- A **Payload** reaches an **Integration** only after **Approval**; through an **API Key** too, a Submission's Payload can be read only after Approval
- An **Integration** is attached to one or more **Forms**; a **Form** can have several **Integrations**
- **Approval** of a **Submission** creates one **Delivery** per **Integration** attached to its **Form**
- Before **Approval**, a user can move a **Submission** to another **Form**, also out of **No Form** (it takes that Form's current **Form Version**, and **Match** and **Fill** run again on its **Reading**) or mark it **Rejected**; after **Approval**, neither is possible

## Flagged ambiguities

- "koppeling" was used for both the Integration and the act of mapping Fields — resolved: **Integration** is the endpoint; the Payload is keyed by the Form's own Fields, so there is no separate mapping step in this version. Deciding which part of a Submission belongs to which Field is **Match**, not mapping.
- "Document" (nl: "Document", "Documenten") also named emails and photos, which are not documents to users — resolved: the domain, the code, the data, the public API, Webhooks and the integrations all say **Submission** (nl: Inzending), see [ADR 0011](docs/adr/0011-submission-everywhere.md). Marketing and legal copy, prompts and the eval fixtures still say "document" in the general sense: a paper.
