// What every call to Vink's public API shares: the base URL, the API Key
// header and Vink's error body ({error: {code, message}}).
const API_URL = 'https://vink.page/v1';

const isVink = (url) => url.startsWith(API_URL);

// Only Vink gets the API Key: the action also downloads files from other hosts.
const addApiKey = (request, z, bundle) => {
  if (isVink(request.url) && bundle.authData.api_key) {
    request.headers.Authorization = `Bearer ${bundle.authData.api_key}`;
  }
  return request;
};

// A refusal shows Vink's own sentence instead of Zapier's generic one. A
// request with skipThrowForStatus handles its refusals itself.
const showVinkError = (response, z) => {
  if (response.status < 400 || response.skipThrowForStatus || !isVink(response.request.url)) return response;
  const error = response.data && response.data.error; // undefined when the body isn't JSON
  if (error && error.message) {
    throw new z.errors.Error(error.message, error.code, response.status);
  }
  return response;
};

module.exports = { API_URL, addApiKey, showVinkError };
