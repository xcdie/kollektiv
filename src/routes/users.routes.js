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
 * Zod validation middleware.
 *
 * Your routes use schemas created with z.object(), so
 * validateBody must use schema.safeParse().
 */
function validateBody(schema) {
  return (req, res, next) => {
    try {
      if (!schema || typeof schema.safeParse !== 'function') {
        return next(
          new Error('validateBody requires a valid Zod schema.')
        );
      }

      const result = schema.safeParse(req.body);

      if (!result.success) {
        const message = result.error.issues
          .map((issue) => {
            const field =
              issue.path.length > 0
                ? issue.path.join('.')
                : 'body';

            return `${field}: ${issue.message}`;
          })
          .join('; ');

        return next(new ApiError(400, message));
      }

      // Replace the request body with Zod's validated/transformed data.
      req.body = result.data;

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
  validateBody
};