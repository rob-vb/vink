// Shared by the tests: a fake Vink and a Form shaped like GET /v1/forms returns.
const API = 'https://vink.page';
const API_KEY = 'vink_live_' + 'a'.repeat(36) + 'x9Kq';
const authData = { api_key: API_KEY };

const invoiceForm = {
  id: 'k17c9z1fx3q8d2v0n6e5w4t8hs7bm2ra',
  name: 'Invoice',
  description: 'Incoming supplier invoices',
  version: 3,
  fields: [
    { key: 'supplier', label: 'Leverancier', type: 'text', required: true },
    { key: 'currency', label: 'Valuta', type: 'choice', required: false, options: ['EUR', 'USD'] },
    { key: 'invoice_date', label: 'Factuurdatum', type: 'date', required: false },
    { key: 'paid', label: 'Betaald', type: 'boolean', required: false },
    {
      key: 'lines',
      label: 'Regels',
      type: 'list',
      required: false,
      fields: [
        { key: 'description', label: 'Omschrijving', type: 'text', required: true },
        { key: 'quantity', label: 'Aantal', type: 'number', required: false },
        { key: 'amount', label: 'Bedrag', type: 'number', required: false },
      ],
    },
  ],
};

module.exports = { API, API_KEY, authData, invoiceForm };
