// 404 + centralized error handler. Throw or next(err) anywhere; this formats it.
export function notFound(_req, res) {
  res.status(404).send("Not found");
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).send(err.message || "Internal server error");
}
