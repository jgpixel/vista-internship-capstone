import User from '../models/User.js'

async function auth(req, res, next) {
  try {
    const user = await User.findOneAndUpdate(
      {
        email: 'demo@example.com'
      },
      {
        email: 'demo@example.com',
        name: 'Demo User',
      },
      {
        upsert: true,
        returnDocument: 'after',
        runValidators: true
      }
    );

    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name
    };

    next();
  } catch (err) {
    next(err);
  }
}

export default auth;