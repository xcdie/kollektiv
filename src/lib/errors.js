class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const notFound = (what) => new ApiError(404, `${what} not found`);
const unauthorized = (msg) => new ApiError(401, msg || 'Authentication required');
const forbidden = (msg) => new ApiError(403, msg || 'Not allowed to do that');
const badRequest = (msg, details) => new ApiError(400, msg || 'Bad request', details);
const conflict = (msg) => new ApiError(409, msg || 'Conflict');

// Express 5 forwards rejected promises from async handlers automatically,
// but this wrapper keeps behavior explicit and safe if that ever changes.
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { ApiError, notFound, unauthorized, forbidden, badRequest, conflict, asyncHandler };
