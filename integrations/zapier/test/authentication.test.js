const nock = require('nock');
const zapier = require('zapier-platform-core');

const App = require('../index');
const appTester = zapier.createAppTester(App);

const { API, API_KEY } = require('./helpers');

describe('authentication', () => {
  it('tests the API Key by listing Forms', async () => {
    const scope = nock(API, { reqheaders: { authorization: `Bearer ${API_KEY}` } })
      .get('/v1/forms')
      .reply(200, { data: [] });

    const bundle = { authData: { api_key: API_KEY } };
    await appTester(App.authentication.test, bundle);

    expect(scope.isDone()).toBe(true);
  });

  it("labels the connection with the key's last four characters, as Vink shows it", async () => {
    const bundle = { authData: { api_key: API_KEY }, inputData: { data: [] } };
    const label = await appTester(App.authentication.connectionLabel, bundle);

    expect(label).toBe('vink_live_…x9Kq');
  });

  it("shows Vink's message when the key is refused", async () => {
    nock(API)
      .get('/v1/forms')
      .reply(401, { error: { code: 'invalid_api_key', message: "This API Key doesn't exist or was revoked." } });

    const bundle = { authData: { api_key: 'vink_live_revoked' } };
    await expect(appTester(App.authentication.test, bundle)).rejects.toThrow(
      "This API Key doesn't exist or was revoked.",
    );
  });
});
