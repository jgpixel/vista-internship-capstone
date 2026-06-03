import dotenv from 'dotenv';
import app from './app.js';
import connectDb from './config/db.js';

dotenv.config();

const PORT = process.env.PORT || 3000;

async function startServer() {
  await connectDb();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();