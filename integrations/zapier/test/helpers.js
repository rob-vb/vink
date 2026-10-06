// Shared by the tests: a fake Vink and a Form shaped like GET /v1/forms returns.
const API = 'https://vink.page';
const API_KEY = 'vink_live_' + 'a'.repeat(36) + 'x9Kq';
const authData = { api_key: API_KEY };

const workOrder = {
  id: 'k17c9z1fx3q8d2v0n6e5w4t8hs7bm2ra',
  name: 'Work order',
  description: 'Garage work orders',
  version: 3,
  fields: [
    { key: 'license_plate', label: 'Kenteken', type: 'text', required: true },
    { key: 'kind', label: 'Soort', type: 'choice', required: false, options: ['repair', 'service'] },
    { key: 'done_on', label: 'Datum', type: 'date', required: false },
    { key: 'paid', label: 'Betaald', type: 'boolean', required: false },
    {
      key: 'lines',
      label: 'Regels',
      type: 'list',
      required: false,
      fields: [
        { key: 'description', label: 'Omschrijving', type: 'text', required: true },
        { key: 'quantity', label: 'Aantal', type: 'number', required: false },
      ],
    },
  ],
};

module.exports = { API, API_KEY, authData, workOrder };
