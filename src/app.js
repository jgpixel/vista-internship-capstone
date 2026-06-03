import express from 'express';
import postsRoutes from './routes/posts.routes.js';
import auth from './middleware/auth.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({
    data: {
      status: 'ok'
    }
  });
});

app.use(auth);

app.use('/posts', postsRoutes);

app.use(errorHandler);

export default app;