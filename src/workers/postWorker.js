import dotenv from 'dotenv';
import { Worker } from 'bullmq';
import connectDb from '../config/db.js';
import { connectRedis } from '../config/redis.js';
import { connection } from '../config/queue.js';
import Post from '../models/Post.js';
import PostJob from '../models/PostJob.js';
import { invalidateUpcomingPostsCache } from '../services/cache.service.js';

dotenv.config();

await connectDb();
await connectRedis();

const worker = new Worker(
  'post-publishing',
  async (job) => {
    const { postId } = job.data;

    const postJob = await PostJob.findOne({
      postId
    });

    if (!postJob) {
      return;
    }

    if (postJob.status === 'succeeded') {
      return;
    }

    postJob.status = 'processing';
    postJob.attempts = job.attemptsMade + 1;
    postJob.lockedAt = new Date();
    await postJob.save();

    const post = await Post.findById(postId);

    if (!post) {
      postJob.status = 'failed';
      postJob.lastError = 'Post not found';
      postJob.failedAt = new Date();
      await postJob.save();
      return;
    }

    if (post.status === 'cancelled' || post.status === 'published') {
      postJob.status = post.status === 'cancelled' ? 'cancelled' : 'succeeded';
      await postJob.save();
      return;
    }

    post.status = 'publishing';
    await post.save();

    console.log(`Publishing ${post.platform} post: ${post.content}`);

    post.status = 'published';
    post.publishedAt = new Date();
    await post.save();

    postJob.status = 'succeeded';
    postJob.completedAt = new Date();
    postJob.lastError = null;
    await postJob.save();

    await invalidateUpcomingPostsCache(post.userId.toString());
  },
  {
    connection
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', async (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

console.log('Post worker running');