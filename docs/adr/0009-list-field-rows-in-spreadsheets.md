# A spreadsheet Integration writes one row per List Field entry

A spreadsheet Integration (Google Sheets, Excel) writes a Document as one row per entry of the Form's first List Field, and repeats the Document's other values on each row; a Document without entries gives one row with the List columns empty. We chose this over one row with the List as JSON in a cell, and over a second tab joined by Document ID, because an ops team can filter and pivot these rows straight away. The cost: any further List Field in the same Form is not spread out, but written as JSON in one cell. Customers build on the layout of their sheets, so changing it later breaks their formulas.

## Consequences

- Columns are headed by Field keys, not labels: keys are locked while an Integration is attached, labels are not.
- Each row also carries `document`, `approved_at`, `approved_by` and `delivery_id`. Column order: `document`, then the Field columns, then `approved_at`, `approved_by` and `delivery_id` at the far right (decided 2026-10-07; before that Vink's four columns came first).
- A Field added in a new Form Version gets a new column inserted just before `approved_at`, so the three trailing columns shift right; existing Field columns are never reordered. Values go under their column by header name, never by position, so a sheet made in the old order keeps working: its new Field columns go just before `approved_at` wherever it is, and nothing already there is moved or rewritten.
