const { API_URL } = require('./lib/api');

module.exports = {
  type: 'custom',
  fields: [
    {
      key: 'api_key',
      label: 'API Key',
      required: true,
      type: 'password',
      helpText:
        'An Admin makes one in Vink under Organisation settings → API Keys. It starts with `vink_live_`. [How API Keys work](https://vink.page/en/developers/api#authentication).',
    },
  ],
  // Any call with a good key works; listing Forms is the cheapest.
  test: { url: `${API_URL}/forms` },
  // The same hint Vink's API Keys list shows, so the user can tell keys apart.
  connectionLabel: (z, bundle) => `vink_live_…${bundle.authData.api_key.slice(-4)}`,
};
