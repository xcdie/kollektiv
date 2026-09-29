const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function isValidId(value) {
  return typeof value === 'string' && ID_RE.test(value);
}

function genId(prefix = 'id') {
  const random = Math.random().toString(36).slice(2, 10);
  const timestamp = Date.now().toString(36);

  return `${prefix}_${timestamp}_${random}`;
}

module.exports = {
  ID_RE,
  isValidId,
  genId
};