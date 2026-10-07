const nock = require('nock');
const zapier = require('zapier-platform-core');

const App = require('../index');
const { API, authData, invoiceForm } = require('./helpers');

const appTester = zapier.createAppTester(App);

describe('Form dropdown', () => {
  it('lists the Forms by id and name', async () => {
    const other = { ...invoiceForm, id: 'k27other', name: 'Delivery note', fields: [] };
    nock(API).get('/v1/forms').reply(200, { data: [invoiceForm, other] });

    const results = await appTester(App.triggers.forms.operation.perform, { authData });

    expect(results).toEqual([
      { id: 'k17c9z1fx3q8d2v0n6e5w4t8hs7bm2ra', name: 'Invoice', description: 'Incoming supplier invoices', version: 3 },
      { id: 'k27other', name: 'Delivery note', description: 'Incoming supplier invoices', version: 3 },
    ]);
  });
});
