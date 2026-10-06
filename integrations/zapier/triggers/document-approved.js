// "Document Approved": a REST hook on Vink's Subscriptions. Turning the Zap on
// subscribes Zapier's hook URL to the Form; every Approval then arrives as the
// envelope every Webhook gets, its List Fields as arrays (Zapier's line items).
const { API_URL } = require('../lib/api');
const sample = require('../samples/envelope.json');

// The envelope has no top-level id; the Delivery's id is the same on retries.
const withId = (envelope) => ({ id: envelope.delivery_id, ...envelope });

const performSubscribe = async (z, bundle) => {
  const response = await z.request({
    url: `${API_URL}/subscriptions`,
    method: 'POST',
    body: { form_id: bundle.inputData.form_id, url: bundle.targetUrl },
  });
  return response.data;
};

const performUnsubscribe = async (z, bundle) => {
  const response = await z.request({
    url: `${API_URL}/subscriptions/${encodeURIComponent(bundle.subscribeData.id)}`,
    method: 'DELETE',
    skipThrowForStatus: true,
  });
  // 404: an Admin deleted its Webhook or the API Key was revoked; it is gone already.
  if (response.status !== 404) response.throwForStatus();
  return response.data;
};

const perform = async (z, bundle) => [withId(bundle.cleanedRequest)];

// Before the first real Approval: example values for the Form's current Fields.
const performList = async (z, bundle) => {
  const response = await z.request({
    url: `${API_URL}/forms/${encodeURIComponent(bundle.inputData.form_id)}/sample`,
  });
  return [withId(response.data)];
};

const OUTPUT_TYPE = { text: 'string', number: 'number', date: 'datetime', boolean: 'boolean', choice: 'string' };

// One output field per Field of the chosen Form; a List Field's sub-Fields as line items.
const formFields = async (z, bundle) => {
  if (!bundle.inputData.form_id) return [];
  const response = await z.request({ url: `${API_URL}/forms` });
  const form = response.data.data.find((f) => f.id === bundle.inputData.form_id);
  if (!form) return [];
  return form.fields.flatMap((field) =>
    field.type === 'list'
      ? (field.fields || []).map((sub) => ({
          key: `data__${field.key}[]${sub.key}`,
          label: `${field.label}: ${sub.label}`,
          type: OUTPUT_TYPE[sub.type] || 'string',
        }))
      : [{ key: `data__${field.key}`, label: field.label, type: OUTPUT_TYPE[field.type] || 'string' }],
  );
};

const envelopeFields = [
  { key: 'id', label: 'Delivery ID' },
  { key: 'event', label: 'Event' },
  { key: 'test', label: 'Test', type: 'boolean' },
  { key: 'document__id', label: 'Document ID' },
  { key: 'document__filename', label: 'Document Filename' },
  { key: 'document__uploaded_at', label: 'Document Uploaded At', type: 'datetime' },
  { key: 'form__id', label: 'Form ID' },
  { key: 'form__version', label: 'Form Version', type: 'integer' },
  { key: 'approval__mode', label: 'Approval Mode' },
  { key: 'approval__by', label: 'Approved By (User ID)' },
  { key: 'approval__at', label: 'Approved At', type: 'datetime' },
];

module.exports = {
  key: 'document_approved',
  noun: 'Document',
  display: {
    label: 'Document Approved',
    description: 'Triggers when a Document of the chosen Form is approved in Vink, with the values of its Fields.',
  },
  operation: {
    type: 'hook',
    inputFields: [
      {
        key: 'form_id',
        label: 'Form',
        required: true,
        dynamic: 'forms.id.name',
        helpText: 'The Form whose approved Documents start this Zap.',
      },
    ],
    performSubscribe,
    performUnsubscribe,
    perform,
    performList,
    sample: withId(sample),
    outputFields: [...envelopeFields, formFields],
  },
};
