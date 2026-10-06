const nock = require('nock');
const zapier = require('zapier-platform-core');

const App = require('../index');
const { API, authData, workOrder } = require('./helpers');

const appTester = zapier.createAppTester(App);
const action = App.creates.send_document.operation;

const FILES = 'https://files.example.com';
const PDF = '%PDF-1.7 a small test PDF';

// The multipart body Vink received, as text: enough to find the part headers and the PDF.
const receive = (capture) => (body) => {
  capture.body = typeof body === 'string' ? body : JSON.stringify(body);
  return true;
};

describe('Send in a Document', () => {
  it("streams the file into Vink as the multipart part 'file', named as the user chose", async () => {
    const download = nock(FILES, { badheaders: ['authorization'] })
      .get('/hydrate/abc')
      .reply(200, PDF, { 'Content-Type': 'application/pdf' });
    const sent = {};
    const upload = nock(API, { reqheaders: { 'content-type': /^multipart\/form-data; boundary=/ } })
      .post(`/v1/forms/${workOrder.id}/documents`, receive(sent))
      .query({ filename: 'werkbon-118.pdf' })
      .reply(201, { id: 'j57doc', state: 'processing' });

    const result = await appTester(action.perform, {
      authData,
      inputData: { form_id: workOrder.id, file: `${FILES}/hydrate/abc`, filename: 'werkbon-118.pdf' },
    });

    expect(download.isDone()).toBe(true);
    expect(upload.isDone()).toBe(true);
    expect(sent.body).toContain('Content-Disposition: form-data; name="file"; filename="werkbon-118.pdf"');
    expect(sent.body).toContain(PDF);
    expect(result).toEqual({ id: 'j57doc', state: 'processing' });
  });

  it("names the Document after the file when no filename is given", async () => {
    nock(FILES)
      .get('/hydrate/abc')
      .reply(200, PDF, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="F-2026-118.pdf"' });
    const sent = {};
    nock(API).post(`/v1/forms/${workOrder.id}/documents`, receive(sent)).reply(201, { id: 'j57doc', state: 'processing' });

    await appTester(action.perform, { authData, inputData: { form_id: workOrder.id, file: `${FILES}/hydrate/abc`, filename: '' } });

    expect(sent.body).toContain('name="file"; filename="F-2026-118.pdf"');
  });

  it("shows Vink's message when Vink refuses the PDF", async () => {
    nock(FILES).get('/big.pdf').reply(200, PDF);
    nock(API)
      .post(`/v1/forms/${workOrder.id}/documents`)
      .reply(422, {
        error: { code: 'too_many_pages', message: 'This PDF has 21 pages. Vink reads up to 20 pages per Document.' },
      });

    await expect(
      appTester(action.perform, { authData, inputData: { form_id: workOrder.id, file: `${FILES}/big.pdf` } }),
    ).rejects.toThrow('This PDF has 21 pages. Vink reads up to 20 pages per Document.');
  });
});
