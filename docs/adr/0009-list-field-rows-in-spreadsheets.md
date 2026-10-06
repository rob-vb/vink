# A spreadsheet Integration writes one row per List Field entry

A spreadsheet Integration (Google Sheets, Excel) writes a Document as one row per entry of the Form's first List Field, and repeats the Document's other values on each row; a Document without entries gives one row with the List columns empty. We chose this over one row with the List as JSON in a cell, and over a second tab joined by Document ID, because an ops team can filter and pivot these rows straight away. The cost: any further List Field in the same Form is not spread out, but written as JSON in one cell. Customers build on the layout of their sheets, so changing it later breaks their formulas.

## Consequences

- Columns are headed by Field keys, not labels: keys are locked while an Integration is attached, labels are not. A Field added in a new Form Version gets a new column on the right.
- Each row also carries `document`, `approved_at`, `approved_by` and `delivery_id`.
