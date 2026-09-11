const { badRequest } = require('./errors');

// Validates UUID format (v4 style). Returns true if valid, false otherwise.
function isValidUUID(id) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return typeof id === 'string' && uuidRegex.test(id);
}

// Wraps a zod schema into Express middleware. On success, req.body is replaced
// with the parsed (and type-coerced/defaulted) value. On failure, responds 400
// with a flat, readable list of field-level problems.
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.') || '(body)',
        message: i.message,
      }));
      return next(badRequest('Invalid request body', details));
    }
    req.body = result.data;
    next();
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.') || '(query)',
        message: i.message,
      }));
      return next(badRequest('Invalid query parameters', details));
    }
    req.query = result.data;
    next();
  };
}

module.exports = { validateBody, validateQuery, isValidUUID };
