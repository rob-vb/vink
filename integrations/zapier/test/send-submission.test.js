const nock = require('nock');
const zapier = require('zapier-platform-core');

const App = require('../index');
const { API, authData, invoiceForm } = require('./helpers');

const appTester = zapier.createAppTester(App);
const action = App.creates.send_submission.operation;

const FILES = 'https://files.example.com';
const PDF = '%PDF-1.7 a small test PDF';

// The multipart body Vink received, as text: enough to find the part headers and the PDF.
const receive = (capture) => (body) => {
  capture.body = typeof body === 'string' ? body : JSON.stringify(body);
  return true;
};

describe('Send in a Submission', () => {
  it("streams the file into Vink as the multipart part 'file', named as the user chose", async () => {
    const download = nock(FILES, { badheaders: ['authorization'] })
      .get('/hydrate/abc')
      .reply(200, PDF, { 'Content-Type': 'application/pdf' });
    const sent = {};
    const upload = nock(API, { reqheaders: { 'content-type': /^multipart\/form-data; boundary=/ } })
      .post(`/v1/forms/${invoiceForm.id}/submissions`, receive(sent))
      .query({ filename: 'factuur-118.pdf' })
      .reply(201, { id: 'j57doc', state: 'processing' });

    const result = await appTester(action.perform, {
      authData,
      inputData: { form_id: invoiceForm.id, file: `${FILES}/hydrate/abc`, filename: 'factuur-118.pdf' },
    });

    expect(download.isDone()).toBe(true);
    expect(upload.isDone()).toBe(true);
    expect(sent.body).toContain('Content-Disposition: form-data; name="file"; filename="factuur-118.pdf"');
    expect(sent.body).toContain(PDF);
    expect(result).toEqual({ id: 'j57doc', state: 'processing' });
  });

  it("names the Submission after the file when no filename is given", async () => {
    nock(FILES)
      .get('/hydrate/abc')
      .reply(200, PDF, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="F-2026-118.pdf"' });
    const sent = {};
    nock(API).post(`/v1/forms/${invoiceForm.id}/submissions`, receive(sent)).reply(201, { id: 'j57doc', state: 'processing' });

    await appTester(action.perform, { authData, inputData: { form_id: invoiceForm.id, file: `${FILES}/hydrate/abc`, filename: '' } });

    expect(sent.body).toContain('name="file"; filename="F-2026-118.pdf"');
  });

  it("shows Vink's message when Vink refuses the PDF", async () => {
    nock(FILES).get('/big.pdf').reply(200, PDF);
    nock(API)
      .post(`/v1/forms/${invoiceForm.id}/submissions`)
      .reply(422, {
        error: { code: 'too_many_pages', message: 'This PDF has 21 pages. Vink reads up to 20 pages per Submission.' },
      });

    await expect(
      appTester(action.perform, { authData, inputData: { form_id: invoiceForm.id, file: `${FILES}/big.pdf` } }),
    ).rejects.toThrow('This PDF has 21 pages. Vink reads up to 20 pages per Submission.');
  });
  it('lets Vink pick the Form when none is chosen: POST /v1/submissions without a Form in the path', async () => {
    nock(FILES).get('/hydrate/abc').reply(200, PDF, { 'Content-Type': 'application/pdf' });
    const sent = {};
    const upload = nock(API, { reqheaders: { 'content-type': /^multipart\/form-data; boundary=/ } })
      .post('/v1/submissions', receive(sent))
      .query({ filename: 'factuur-118.pdf' })
      .reply(201, { id: 'j57doc', state: 'processing' });

    const result = await appTester(action.perform, {
      authData,
      inputData: { form_id: '', file: `${FILES}/hydrate/abc`, filename: 'factuur-118.pdf' },
    });

    expect(upload.isDone()).toBe(true);
    expect(sent.body).toContain('Content-Disposition: form-data; name="file"; filename="factuur-118.pdf"');
    expect(sent.body).toContain('Content-Type: application/octet-stream');
    expect(sent.body).not.toContain('name="form_id"');
    expect(result).toEqual({ id: 'j57doc', state: 'processing' });
  });

  it('sends a photo as application/octet-stream: Vink reads the type from the bytes', async () => {
    nock(FILES).get('/hydrate/kwitantie').reply(200, '\xff\xd8\xff\xe0 a small test JPEG', { 'Content-Type': 'application/octet-stream' });
    const sent = {};
    nock(API).post('/v1/submissions', receive(sent)).query({ filename: 'kwitantie.JPG' }).reply(201, { id: 'j57img', state: 'processing' });

    const result = await appTester(action.perform, {
      authData,
      inputData: { form_id: '', file: `${FILES}/hydrate/kwitantie`, filename: 'kwitantie.JPG' },
    });

    expect(sent.body).toContain('Content-Disposition: form-data; name="file"; filename="kwitantie.JPG"');
    expect(sent.body).toContain('Content-Type: application/octet-stream');
    expect(sent.body).not.toContain('Content-Type: image/jpeg');
    expect(result).toEqual({ id: 'j57img', state: 'processing' });
  });

  it('sends an .eml email as application/octet-stream: its .eml name is enough for Vink', async () => {
    const eml = 'From: klant@example.com\r\nSubject: Klacht\r\n\r\nDe factuur klopt niet.';
    nock(FILES).get('/hydrate/mail').reply(200, eml);
    const sent = {};
    nock(API).post('/v1/submissions', receive(sent)).query({ filename: 'klacht.eml' }).reply(201, { id: 'j57mail', state: 'processing' });

    const result = await appTester(action.perform, {
      authData,
      inputData: { form_id: '', file: `${FILES}/hydrate/mail`, filename: 'klacht.eml' },
    });

    expect(sent.body).toContain('Content-Disposition: form-data; name="file"; filename="klacht.eml"');
    expect(sent.body).toContain('Content-Type: application/octet-stream');
    expect(sent.body).not.toContain('message/rfc822');
    expect(result).toEqual({ id: 'j57mail', state: 'processing' });
  });

  it('leaves the type to the bytes (application/octet-stream) for a file type Vink does not name', async () => {
    nock(FILES).get('/hydrate/scan').reply(200, PDF);
    const sent = {};
    nock(API).post('/v1/submissions', receive(sent)).query({ filename: 'scan.tiff' }).reply(201, { id: 'j57scan', state: 'processing' });

    await appTester(action.perform, { authData, inputData: { form_id: '', file: `${FILES}/hydrate/scan`, filename: 'scan.tiff' } });

    expect(sent.body).toContain('Content-Type: application/octet-stream');
  });

  it('does not let a wrong extension decide the type: a JPEG named scan.pdf goes as octet-stream', async () => {
    nock(FILES).get('/hydrate/scan').reply(200, '\xff\xd8\xff\xe0 a small test JPEG', { 'Content-Type': 'image/jpeg' });
    const sent = {};
    nock(API).post('/v1/submissions', receive(sent)).query({ filename: 'scan.pdf' }).reply(201, { id: 'j57scan', state: 'processing' });

    await appTester(action.perform, { authData, inputData: { form_id: '', file: `${FILES}/hydrate/scan`, filename: 'scan.pdf' } });

    expect(sent.body).toContain('filename="scan.pdf"');
    expect(sent.body).toContain('Content-Type: application/octet-stream');
    expect(sent.body).not.toContain('Content-Type: application/pdf');
  });

  it("shows Vink's message when Vink refuses a file whose Content-Type contradicts its bytes (415)", async () => {
    nock(FILES).get('/hydrate/foto.pdf').reply(200, '\x89PNG\r\n\x1a\n a small test PNG');
    nock(API)
      .post('/v1/submissions')
      .reply(415, {
        error: {
          code: 'media_type_mismatch',
          message: 'The Content-Type is application/pdf, but the file is image/png. Send it with its own Content-Type, or as application/octet-stream.',
        },
      });

    await expect(
      appTester(action.perform, { authData, inputData: { form_id: '', file: `${FILES}/hydrate/foto.pdf` } }),
    ).rejects.toThrow('The Content-Type is application/pdf, but the file is image/png.');
  });
});
