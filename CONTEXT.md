# DocuHelper

Multi-tenant SaaS that reads documents (PDF, incl. handwritten), extracts their data into user-defined Forms, and — after approval — sends it to external systems via Integrations.

## Language

**Form**:
A user-defined set of Fields describing one kind of document.
_Avoid_: template, schema

**Field**:
A named, typed slot on a Form, optionally with a description that guides extraction.

**Document**:
An incoming file (PDF) to be processed against one Form.
_Avoid_: upload, file

**Extraction**:
The raw content pulled out of a Document (text, layout, handwriting).

**Field Value**:
The value assigned to a Field for a given Document, carrying a confidence score.

**Needs Review**:
Status of a Field Value whose confidence is below the threshold; a user must check it.

**Approval**:
The go-ahead to send a Document's Payload to an Integration — given by a user, or automatically when every Field Value meets the Form's Auto-Send Threshold.

**Auto-Send Threshold**:
A user-set confidence (0–1) per Form; when all Field Values meet it, Approval is automatic. Unset means always manual.

**Payload**:
The JSON built from a Document's Field Values, keyed by the Form's Fields.

**Integration**:
An external endpoint that receives a Payload by HTTP POST.
_Avoid_: koppeling, connector

## Relationships

- A **Document** is processed against exactly one **Form**, chosen by the user at intake
- A **Form** has many **Fields**; each **Document** yields one **Field Value** per **Field**
- A **Field Value** below the confidence threshold is **Needs Review**
- A **Payload** reaches an **Integration** only after **Approval**

## Flagged ambiguities

- "koppeling" was used for both the Integration and the act of mapping Fields — resolved: **Integration** is the endpoint; the Payload is keyed by the Form's own Fields, so there is no separate mapping step in this version.
