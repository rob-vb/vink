const zapier = require('zapier-platform-core');

const authentication = require('./authentication');
const sendDocument = require('./creates/send-document');
const documentApproved = require('./triggers/document-approved');
const forms = require('./triggers/forms');
const { addApiKey, showVinkError } = require('./lib/api');

module.exports = {
  version: require('./package.json').version,
  platformVersion: zapier.version,
  // Empty inputs reach perform as they are; the code treats "" as not given.
  flags: { cleanInputData: false },
  authentication,
  beforeRequest: [addApiKey],
  afterResponse: [showVinkError],
  triggers: {
    [documentApproved.key]: documentApproved,
    [forms.key]: forms,
  },
  creates: {
    [sendDocument.key]: sendDocument,
  },
};
