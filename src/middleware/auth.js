function auth(req, res, next) {
  req.user = {
    id: 'demo-user-id',
    email: 'demo@example.com'
  };

  next();
}

export default auth;