function log(level, message, meta) {
  const ts = new Date().toISOString();
  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  const output = `[${ts}] [${level.toUpperCase()}] ${message}${suffix}`;
  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

module.exports = { log };
