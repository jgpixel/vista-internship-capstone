function asyncHandler(callback) {
  return function wrappedRoute(req, res, next) {
    Promise.resolve(callback(req, res, next)).catch(next);
  };
}

export default asyncHandler;