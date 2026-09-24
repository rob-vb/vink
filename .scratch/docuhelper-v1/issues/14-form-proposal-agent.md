# Form proposal from a sample Document

Type: grilling
Status: resolved
Blocked by: 

## Question

How does the "template agent" work: a user uploads one sample PDF, it is scanned once, and a Form is proposed? Decide:
- whether it is in v1;
- its flow: upload, then a proposal, then the user edits it in the Form editor and saves a Form Version;
- what it proposes: labels, keys, types, `choice` options, List Fields and their sub-Fields, descriptions and required flags, all within the [Field model](04-field-model.md);
- how the Dutch labels on the document become English keys;
- whether the sample is also extracted as the first Document;
- whether several samples improve the proposal;
- which model it uses (probably the extraction model from [Extraction pipeline design](08-extraction-pipeline.md)) and what it costs;
- what happens with bundles (several document types in one PDF).

The agent that proposed the Forms in [Test document set with ground truth](03-test-document-set.md) is prior art.

## Comments

**2026-09-24 (from API pipeline benchmark):** Under ADR 0003 every Document gets a Reading, a Form-independent JSON of its content with its own keys and arrays. A Form proposal could be derived from the sample's Reading (its objects and arrays become Fields and List Fields), and then matching the same Reading to the new Form fills the first Document for free.

## Answer

Settled with the user on 2026-09-24. The new term **Form Proposal** is recorded in `CONTEXT.md`. No ADR was written, because nothing here is hard to reverse.

- **In v1, as the normal way to start a Form.** "New Form" offers "from a sample PDF" or "blank". The same proposal is also a button in the Form editor, "Suggest Fields from PDF", which adds Fields to an existing Form. Only an Admin can use either.
- **Flow:** an Admin uploads one sample, and Read runs in the background, as in an Extraction. The Admin sees progress and can leave and come back. The proposal becomes a **Form Proposal**. The Admin ticks which proposed Fields to keep, then edits them in the normal Form editor and saves a Form Version. If the Read or the proposal fails, the Admin sees an error and can retry or start blank. An unsaved Form Proposal is deleted after 7 days, together with its PDF and Reading.
- **Input:** one call to the vision model (configuration, like Read) with the sample's Reading **plus** its pages (images and text layer). The Reading makes sure nothing is missed. The pages supply the printed labels and any pre-printed option lists, which the Reading doesn't keep: it has English keys and values as read. Form creation is rare, so quality weighs more than the few cents it costs.
- **What it proposes:** everything in the Reading is listed, and the model pre-ticks what serves the document's purpose. Supplier bank details, phone numbers and the like are listed but left unticked. So nothing is dropped silently, and the Admin only unticks.
- **Labels, keys, descriptions:** the label is the term as printed, in the Document's language ("Kilometerstand"). The key is English camelCase from the meaning ("mileageKm"), and it stays editable until an Integration is attached. The description is English and includes the printed terms as synonyms ("Odometer reading in km (Kilometerstand, Km. stand)"), so Match works for other suppliers too.
- **Types:** the type follows from the content. Amounts and measures become `number`, dates `date`, ticks `boolean`, repeated objects a `list` with sub-Fields. `choice` is proposed only when the options are visible on the paper, such as pre-printed boxes or a list. One filled-in value never becomes an option list. **Required** is off on every Field, because required blocks Auto-Send, so the Admin sets it on purpose.
- **Sample as first Document:** when the first Form Version is saved, a checkbox "Also process this sample as a Document" is on by default. If it stays on, Match and Fill run on the stored Reading, and the sample goes to review like any Document. If the Admin turns it off, the PDF and Reading are deleted at once.
- **Several samples:** one sample per proposal in v1. A second sample goes through "Suggest Fields from PDF" on the existing Form. Jev's Match runs on the new Reading against the current Form, and only Reading parts that match `none` are proposed. Saving creates a new Form Version.
- **Bundles:** one Form for the whole PDF. The Reading already merges the papers into one job, which fits "one PDF is one Document". The Admin unticks what they don't want.
- **No benchmark before the spec.** An Admin always reviews the proposal, so a weak proposal costs time, not data. The manual proposals from [Test document set with ground truth](03-test-document-set.md) already show it works. The prompt is tried on the 5 fixtures when it is built.
