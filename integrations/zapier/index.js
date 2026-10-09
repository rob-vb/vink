const zapier = require('zapier-platform-core');

const authentication = require('./authentication');
const sendSubmission = require('./creates/send-submission');
const submissionApproved = require('./triggers/submission-approved');
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
    [submissionApproved.key]: submissionApproved,
    [forms.key]: forms,
  },
  creates: {
    [sendSubmission.key]: sendSubmission,
  },
};
