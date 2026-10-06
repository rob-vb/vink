// "Send in a Document": streams a file (a Zapier file or any URL) into Vink as
// the multipart part `file`. It becomes a Document of the chosen Form, exactly
// as if it was emailed to the Form's Intake Address.
const FormData = require('form-data');

const { API_URL } = require('../lib/api');

// The user's filename, else the one the file's host gives, else the URL's.
// The part always gets one: without it the PDF would arrive as a text field.
const filenameOf = (given, download) => {
  if (given) return given;
  const disposition = download.headers.get('content-disposition') || '';
  const fromHost = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (fromHost) return decodeURIComponent(fromHost[1]);
  const fromUrl = new URL(download.url).pathname.split('/').pop();
  return fromUrl && /\.pdf$/i.test(fromUrl) ? decodeURIComponent(fromUrl) : 'document.pdf';
};

const perform = async (z, bundle) => {
  const { form_id: formId, file, filename } = bundle.inputData;
  const download = await z.request({ url: file, raw: true });

  const form = new FormData();
  form.append('file', download.body, {
    filename: filenameOf(filename, download),
    contentType: 'application/pdf',
  });

  const response = await z.request({
    url: `${API_URL}/forms/${encodeURIComponent(formId)}/documents`,
    method: 'POST',
    params: filename ? { filename } : {},
    headers: form.getHeaders(),
    body: form,
  });
  return response.data;
};

module.exports = {
  key: 'send_document',
  noun: 'Document',
  display: {
    label: 'Send in a Document',
    description: 'Sends a PDF to a Form in Vink. Vink reads it into the Form\'s Fields for review.',
  },
  operation: {
    inputFields: [
      {
        key: 'form_id',
        label: 'Form',
        required: true,
        dynamic: 'forms.id.name',
        helpText: 'The Form Vink reads the PDF with.',
      },
      {
        key: 'file',
        label: 'PDF',
        required: true,
        type: 'file',
        helpText:
          'A PDF file from an earlier step, or a URL to one. At most 20 MB and 20 pages; it uses Pages of your Organisation.',
      },
      {
        key: 'filename',
        label: 'Filename',
        required: false,
        helpText: 'The name the Document shows in Vink. Leave empty to keep the file\'s own name.',
      },
    ],
    perform,
    sample: { id: 'j57b2x0sd4kq9r1m8n3c6v7w5h7bm2rb', state: 'processing' },
    outputFields: [
      { key: 'id', label: 'Document ID' },
      { key: 'state', label: 'State' },
    ],
  },
};
