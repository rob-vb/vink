const nock = require('nock');
const zapier = require('zapier-platform-core');

const App = require('../index');
const { API, authData, invoiceForm } = require('./helpers');

const appTester = zapier.createAppTester(App);
const trigger = App.triggers.document_approved.operation;

const targetUrl = 'https://hooks.zapier.com/hooks/standard/123456/abcdef/';
const subscription = { id: 'j57sub', form_id: invoiceForm.id, url: targetUrl, created_at: '2026-10-06T09:00:00.000Z' };

// The envelope every Webhook gets on an Approval (and GET /forms/{id}/sample returns).
const envelope = {
  event: 'document.approved',
  delivery_id: 'd8f1c2a4-0b9e-4c57-9a3d-2e6f7b1c5a90',
  test: false,
  document: { id: 'j57doc', filename: 'factuur-118.pdf', uploaded_at: '2026-10-06T08:59:00.000Z' },
  form: { id: invoiceForm.id, version: 3 },
  approval: { mode: 'manual', by: 'user_1', at: '2026-10-06T09:00:00.000Z' },
  data: {
    supplier: 'Hoekstra Installatie',
    currency: 'EUR',
    invoice_date: '2026-10-05',
    paid: false,
    lines: [
      { description: 'Copy paper A4', quantity: 10, amount: 49.9 },
      { description: 'Toner cartridge', quantity: 2, amount: 128 },
    ],
  },
};

describe('Document Approved', () => {
  it("subscribes Zapier's hook URL to the chosen Form", async () => {
    const scope = nock(API)
      .post('/v1/subscriptions', { form_id: invoiceForm.id, url: targetUrl })
      .reply(201, subscription);

    const subscribeData = await appTester(trigger.performSubscribe, {
      authData,
      inputData: { form_id: invoiceForm.id },
      targetUrl,
    });

    expect(scope.isDone()).toBe(true);
    expect(subscribeData).toEqual(subscription);
  });

  it('ends the Subscription when the Zap is turned off', async () => {
    const scope = nock(API).delete('/v1/subscriptions/j57sub').reply(200, { id: 'j57sub', deleted: true });

    await appTester(trigger.performUnsubscribe, { authData, subscribeData: subscription });

    expect(scope.isDone()).toBe(true);
  });

  it('treats a Subscription that is already gone as ended', async () => {
    nock(API)
      .delete('/v1/subscriptions/j57sub')
      .reply(404, { error: { code: 'not_found', message: "There's no Subscription with that id in your Organisation." } });

    await expect(
      appTester(trigger.performUnsubscribe, { authData, subscribeData: subscription }),
    ).resolves.toBeDefined();
  });

  it('turns a Webhook POST into one approved Document, its List Field as line items', async () => {
    const results = await appTester(trigger.perform, {
      authData,
      inputData: { form_id: invoiceForm.id },
      cleanedRequest: envelope,
    });

    expect(results).toEqual([{ id: envelope.delivery_id, ...envelope }]);
    expect(results[0].data.lines).toHaveLength(2);
  });

  it("loads the Form's sample envelope while the Zap is being set up", async () => {
    const sample = { ...envelope, delivery_id: 'test_3f2a', test: true };
    nock(API).get(`/v1/forms/${invoiceForm.id}/sample`).reply(200, sample);

    const results = await appTester(trigger.performList, { authData, inputData: { form_id: invoiceForm.id } });

    expect(results).toEqual([{ id: 'test_3f2a', ...sample }]);
  });

  it("names the output after the chosen Form's Fields", async () => {
    nock(API).get('/v1/forms').reply(200, { data: [invoiceForm] });

    const fields = await appTester(trigger.outputFields.at(-1), { authData, inputData: { form_id: invoiceForm.id } });

    expect(fields).toEqual([
      { key: 'data__supplier', label: 'Leverancier', type: 'string' },
      { key: 'data__currency', label: 'Valuta', type: 'string' },
      { key: 'data__invoice_date', label: 'Factuurdatum', type: 'datetime' },
      { key: 'data__paid', label: 'Betaald', type: 'boolean' },
      { key: 'data__lines[]description', label: 'Regels: Omschrijving', type: 'string' },
      { key: 'data__lines[]quantity', label: 'Regels: Aantal', type: 'number' },
      { key: 'data__lines[]amount', label: 'Regels: Bedrag', type: 'number' },
    ]);
  });
});
