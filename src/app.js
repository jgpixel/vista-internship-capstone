import express from 'express';
import postsRoutes from './routes/posts.routes.js';
import auth from './middleware/auth.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();

app.use(express.json());

app.use(auth);

app.use('/posts', postsRoutes);

app.use(errorHandler);

export default app;