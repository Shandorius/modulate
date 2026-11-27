function httpError(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

const notFound = (message = 'Not found.') => httpError(404, 'NOT_FOUND', message);
const badRequest = (message, details) =>
  httpError(400, 'VALIDATION_ERROR', message, details);
const conflict = (message) => httpError(409, 'CONFLICT', message);
const forbidden = (message = 'Not authorized.') =>
  httpError(403, 'FORBIDDEN', message);

module.exports = { httpError, notFound, badRequest, conflict, forbidden };
