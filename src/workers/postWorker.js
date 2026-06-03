import dotenv from 'dotenv';
import { Worker } from 'bullmq';
import connectDb from '../config/db.js';
import { connectRedis } from '../config/redis.js';
import { connection, postDeadLetterQueue } from '../config/queue.js';
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

    const post = await Post.findById(postId);

    if (!post) {
      postJob.status = 'failed';
      postJob.lastError = 'Post not found';
      postJob.failedAt = new Date();
      await postJob.save();
      return;
    }

    if (post.status === 'published') {
      postJob.status = 'succeeded';
      postJob.completedAt = post.publishedAt || new Date();
      await postJob.save();
      return;
    }

    if (post.status === 'cancelled') {
      postJob.status = 'cancelled';
      await postJob.save();
      return;
    }

    postJob.status = 'processing';
    postJob.attempts = job.attemptsMade + 1;
    postJob.lockedAt = new Date();
    await postJob.save();

    post.status = 'publishing';
    await post.save();

    // Uncomment to test DLQ/failed schedule
    // throw new Error('Forced publish failure');

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

  if (!job) {
    return;
  }

  const maxAttempts = job.opts.attempts || 1;
  const isFinalAttempt = job.attemptsMade >= maxAttempts;

  if (!isFinalAttempt) {
    return;
  }

  const { postId } = job.data;

  await PostJob.findOneAndUpdate(
    {
      postId
    },
    {
      status: 'dead',
      lastError: err.message,
      failedAt: new Date()
    },
    {
      returnDocument: 'after',
      runValidators: true
    }
  );

  const post = await Post.findByIdAndUpdate(
    postId,
    {
      status: 'failed'
    },
    {
      returnDocument: 'after',
      runValidators: true
    }
  );

  await postDeadLetterQueue.add('dead-post-job', {
    postId,
    originalJobId: job.id,
    error: err.message,
    failedAt: new Date().toISOString()
  });

  if (post) {
    await invalidateUpcomingPostsCache(post.userId.toString());
  }
});

console.log('Post worker running');