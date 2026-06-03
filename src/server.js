import dotenv from 'dotenv';
import app from './app.js';
import connectDb from './config/db.js';
import { connectRedis } from './config/redis.js';

dotenv.config();

const PORT = process.env.PORT || 3000;

async function startServer() {
  await connectDb();
  await connectRedis();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();