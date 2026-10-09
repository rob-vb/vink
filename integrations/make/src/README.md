Vink
====

Vink reads PDFs (work orders, invoices, delivery notes) into the Fields of a Form. A person checks the result, and on Approval the data goes on to your other tools.

Connection
----------

You need an API Key. An Admin makes one in Vink under Settings → API Keys. Paste it into the connection.

Modules
-------

- **Watch approved Submissions**: starts your scenario each time a Submission of the chosen Form is approved. The output holds the Form's Fields under `data`; a List Field is an array, one item per row.
- **Send in a Submission**: sends a PDF to a Form. Vink reads it, then a person approves it in Vink.
