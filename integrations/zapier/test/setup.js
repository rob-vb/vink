// Every test file talks to a fake Vink only. Jest loads nock once per file but
// the http patch is global, so each file switches it on and off itself.
const nock = require('nock');

beforeAll(() => {
  if (!nock.isActive()) nock.activate();
  nock.disableNetConnect();
});
afterEach(() => nock.cleanAll());
afterAll(() => {
  nock.enableNetConnect();
  nock.restore();
});
