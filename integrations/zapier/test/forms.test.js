const nock = require('nock');
const zapier = require('zapier-platform-core');

const App = require('../index');
const { API, authData, workOrder } = require('./helpers');

const appTester = zapier.createAppTester(App);

describe('Form dropdown', () => {
  it('lists the Forms by id and name', async () => {
    const other = { ...workOrder, id: 'k27other', name: 'Invoice', fields: [] };
    nock(API).get('/v1/forms').reply(200, { data: [workOrder, other] });

    const results = await appTester(App.triggers.forms.operation.perform, { authData });

    expect(results).toEqual([
      { id: 'k17c9z1fx3q8d2v0n6e5w4t8hs7bm2ra', name: 'Work order', description: 'Garage work orders', version: 3 },
      { id: 'k27other', name: 'Invoice', description: 'Garage work orders', version: 3 },
    ]);
  });
});
