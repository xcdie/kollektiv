const { ApiError } = require('./errors');

function requiredString(value, field, maxLength = 5000) {
  if (typeof value !== 'string') {
    throw new ApiError(400, `${field} must be a string.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new ApiError(400, `${field} is required.`);
  }

  if (trimmed.length > maxLength) {
    throw new ApiError(
      400,
      `${field} must not exceed ${maxLength} characters.`
    );
  }

  return trimmed;
}

function optionalString(value, field, maxLength = 5000) {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new ApiError(400, `${field} must be a string.`);
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    throw new ApiError(
      400,
      `${field} must not exceed ${maxLength} characters.`
    );
  }

  return trimmed || null;
}

function requiredEmail(value) {
  const email = requiredString(value, 'email', 320).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, 'Invalid email address.');
  }

  return email;
}

function optionalUrl(value, field = 'url') {
  const url = optionalString(value, field, 2048);

  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error();
    }

    return parsed.toString();
  } catch {
    throw new ApiError(
      400,
      `${field} must be a valid HTTP or HTTPS URL.`
    );
  }
}

function requiredEnum(value, field, allowed) {
  const normalized = requiredString(value, field, 100);

  if (!allowed.includes(normalized)) {
    throw new ApiError(
      400,
      `${field} must be one of: ${allowed.join(', ')}.`
    );
  }

  return normalized;
}

/*
 * Shared helper: throws immediately (at server boot, when the route is
 * registered) if a route passes something that is not a Zod schema.
 */
function assertSchema(schema, name) {
  if (!schema || typeof schema.safeParse !== 'function') {
    throw new Error(`${name} requires a valid Zod schema.`);
  }
}

/*
 * Shared helper: turns Zod issues into an ApiError.
 */
function toApiError(error, defaultField) {
  const details = error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : defaultField,
    message: issue.message,
  }));

  const message = details
    .map((item) => `${item.field}: ${item.message}`)
    .join('; ');

  return new ApiError(400, message, details);
}

/*
 * Zod validation middleware for request bodies.
 *
 * Routes can pass any valid Zod schema created with
 * z.object(), z.string(), z.array(), etc.
 */
function validateBody(schema) {
  assertSchema(schema, 'validateBody');

  return (req, res, next) => {
    try {
      // `?? {}` handles requests that arrive with no body at all.
      const result = schema.safeParse(req.body ?? {});

      if (!result.success) {
        return next(toApiError(result.error, 'body'));
      }

      req.body = result.data;

      next();
    } catch (error) {
      next(error);
    }
  };
}

/*
 * Zod validation middleware for query strings.
 */
function validateQuery(schema) {
  assertSchema(schema, 'validateQuery');

  return (req, res, next) => {
    try {
      const result = schema.safeParse(req.query);

      if (!result.success) {
        return next(toApiError(result.error, 'query'));
      }

      // req.query is a getter in Express 5, so redefine it instead of assigning.
      Object.defineProperty(req, 'query', {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  requiredString,
  optionalString,
  requiredEmail,
  optionalUrl,
  requiredEnum,
  validateBody,
  validateQuery,
};