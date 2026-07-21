export function success(res, data, message, statusCode = 200) {
  return res.status(statusCode).json({
    status: "success",
    ...(message && { message }),
    data,
  });
}

export function created(res, data, message) {
  return success(res, data, message, 201);
}

export function noContent(res) {
  return res.status(204).end();
}
