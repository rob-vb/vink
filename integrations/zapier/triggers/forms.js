// Hidden: fills the Form dropdowns of "Document Approved" and "Send in a Document".
const { API_URL } = require('../lib/api');

const perform = async (z) => {
  const response = await z.request({ url: `${API_URL}/forms` });
  return response.data.data.map(({ id, name, description, version }) => ({ id, name, description, version }));
};

module.exports = {
  key: 'forms',
  noun: 'Form',
  display: {
    label: 'List Forms',
    description: 'Lists the Forms of your Organisation, for the Form dropdowns.',
    hidden: true,
  },
  operation: {
    perform,
    sample: { id: 'k17c9z1fx3q8d2v0n6e5w4t8hs7bm2ra', name: 'Invoice', description: 'Incoming supplier invoices', version: 3 },
  },
};
