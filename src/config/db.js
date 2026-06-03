import mongoose from 'mongoose';

async function connectDb() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected');
}

export default connectDb;