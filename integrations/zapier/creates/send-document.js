// "Send in a Document": streams a file (a Zapier file or any URL) into Vink as
// the multipart part `file`. With a Form it becomes that Form's Document, as if
// it was emailed to the Form's Intake Address (POST /v1/forms/{id}/documents).
// Without one, Vink's Router picks the Form (POST /v1/documents); a file that
// fits none waits under No Form in Vink.
const FormData = require('form-data');

const { API_URL } = require('../lib/api');

// The file types Vink reads, by extension. Vink decides from the bytes; the
// Content-Type sent here only has to agree with them. Anything else goes as
// application/octet-stream, which leaves the bytes to decide.
const TYPE_OF_EXTENSION = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heic',
  eml: 'message/rfc822',
};
const EXTENSION_OF_TYPE = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'message/rfc822': 'eml',
};

const typeOfName = (name) => TYPE_OF_EXTENSION[(name || '').split('.').pop().toLowerCase()] || null;

// The user's filename, else the one the file's host gives, else the URL's when
// it names a type Vink reads, else `document` with the host's type's extension.
// The part always gets one: without it the file would arrive as a text field.
const filenameOf = (given, download) => {
  if (given) return given;
  const disposition = download.headers.get('content-disposition') || '';
  const fromHost = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (fromHost) return decodeURIComponent(fromHost[1]);
  const fromUrl = new URL(download.url).pathname.split('/').pop();
  if (fromUrl && typeOfName(fromUrl)) return decodeURIComponent(fromUrl);
  const hostType = contentTypeOf(null, download);
  return EXTENSION_OF_TYPE[hostType] ? `document.${EXTENSION_OF_TYPE[hostType]}` : 'document';
};

// The type by the name, else the host's type when it is one Vink reads, else octet-stream.
const contentTypeOf = (name, download) => {
  const byName = typeOfName(name);
  if (byName) return byName;
  const host = (download.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  return Object.values(TYPE_OF_EXTENSION).includes(host) ? host : 'application/octet-stream';
};

const perform = async (z, bundle) => {
  const { form_id: formId, file, filename } = bundle.inputData;
  const download = await z.request({ url: file, raw: true });
  const name = filenameOf(filename, download);

  const form = new FormData();
  form.append('file', download.body, {
    filename: name,
    contentType: contentTypeOf(name, download),
  });

  // An empty Form (Zapier sends "" for it) lets Vink pick the Form.
  const url = formId
    ? `${API_URL}/forms/${encodeURIComponent(formId)}/documents`
    : `${API_URL}/documents`;
  const response = await z.request({
    url,
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
    description:
      'Sends a PDF, a photo (JPG, PNG, HEIC) or an email (.eml) to Vink. Vink reads it into the Form\'s Fields for review, or picks the Form when none is chosen.',
  },
  operation: {
    inputFields: [
      {
        key: 'form_id',
        label: 'Form',
        required: false,
        dynamic: 'forms.id.name',
        helpText:
          'The Form Vink reads the file with. Leave empty and Vink picks the Form from your Forms. A file that fits none waits under No Form in Vink.',
      },
      {
        key: 'file',
        label: 'File',
        required: true,
        type: 'file',
        helpText:
          'A PDF, JPG, PNG or HEIC photo, or an .eml email from an earlier step, or a URL to one. At most 10 MB, and a PDF at most 20 pages. Every Item of your Organisation counts: a PDF page, a photo, or an email (its text and each attachment).',
      },
      {
        key: 'filename',
        label: 'Filename',
        required: false,
        helpText: 'The name the Document shows in Vink. Leave empty to keep the file\'s own name.',
      },
    ],
    perform,
    // The send answers with the new Document only; its Form and a No Form state come later, in Vink.
    sample: { id: 'j57b2x0sd4kq9r1m8n3c6v7w5h7bm2rb', state: 'processing' },
    outputFields: [
      { key: 'id', label: 'Document ID' },
      { key: 'state', label: 'State' },
    ],
  },
};
