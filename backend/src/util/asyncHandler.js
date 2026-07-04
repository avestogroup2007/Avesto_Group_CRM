// Оборачивает async-обработчик, чтобы отклонённый промис уходил в errorHandler,
// а не «падал» молча.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
