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
    throw new ApiError(400, `${field} must be a valid HTTP or HTTPS URL.`);
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

module.exports = {
  requiredString,
  optionalString,
  requiredEmail,
  optionalUrl,
  requiredEnum
};