class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

function notFound(message = 'Resource not found.') {
  return new ApiError(404, message);
}

function badRequest(message = 'Bad request.') {
  return new ApiError(400, message);
}

function unauthorized(message = 'Authentication required.') {
  return new ApiError(401, message);
}

function forbidden(message = 'Forbidden.') {
  return new ApiError(403, message);
}

module.exports = {
  ApiError,
  notFound,
  badRequest,
  unauthorized,
  forbidden
};