import mongoose from 'mongoose';
import Post from '../models/Post.js';
import SocialAccount from '../models/SocialAccount.js';
import PostJob from '../models/PostJob.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  getCachedUpcomingPosts,
  setCachedUpcomingPosts,
  invalidateUpcomingPostsCache
} from '../services/cache.service.js';
import { postQueue } from '../config/queue.js';
import { encodeCursor, decodeCursor } from '../utils/cursor.js';
import { POST_PLATFORMS, POST_STATUSES, POST_ALLOWED_UPDATES } from '../constants/post.constants.js';

export const createPost = asyncHandler(async (req, res) => {
  const idempotencyKey = req.get('Idempotency-Key');

  if (!idempotencyKey) {
    throw new AppError(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Idempotency-Key header is required'
    );
  }

  const existingPost = await Post.findOne({
    userId: req.user.id,
    idempotencyKey
  });

  if (existingPost) {
    return res.status(200).json({
      data: existingPost
    });
  }

  const { socialAccountId, platform, content, scheduledAt } = req.body;

  if (!socialAccountId || !platform || !content || !scheduledAt) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'socialAccountId, platform, content, and scheduledAt are required'
    );
  }

  if (!mongoose.isValidObjectId(socialAccountId)) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'Invalid socialAccountId'
    );
  }

  if (!POST_PLATFORMS.includes(platform)) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'Invalid platform'
    );
  }

  if (Number.isNaN(new Date(scheduledAt).getTime())) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'Invalid scheduledAt date'
    );
  }

  const socialAccount = await SocialAccount.findOne({
    _id: socialAccountId,
    userId: req.user.id
  });

  if (!socialAccount) {
    throw new AppError(
      404,
      'SOCIAL_ACCOUNT_NOT_FOUND',
      'Social account not found'
    );
  }

  if (socialAccount.platform !== platform) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'Platform does not match social account'
    );
  }

  const post = await Post.create({
    userId: req.user.id,
    socialAccountId,
    platform,
    content,
    scheduledAt,
    idempotencyKey,
    status: 'scheduled',
  });

  const delay = new Date(scheduledAt).getTime() - Date.now();

  const bullJob = await postQueue.add(
    'publish-post',
    {
      postId: post._id.toString()
    },
    {
      delay: Math.max(delay, 0),
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  await PostJob.create({
    postId: post._id,
    userId: req.user.id,
    bullJobId: bullJob.id,
    status: 'queued'
  });

  await invalidateUpcomingPostsCache(req.user.id);

  return res.status(201).json({
    data: post
  });
});

export const getPosts = asyncHandler(async (req, res) => {
  const { platform, status, cursor } = req.query;

  // Caps pagination to 50 posts, defaults to 10, prevents negative numbers
  const requestedLimit = Number(req.query.limit) || 10;
  const limit = Math.min(Math.max(requestedLimit, 1), 50);

  if (platform && !POST_PLATFORMS.includes(platform)) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'Invalid platform filter'
    );
  }

  if (status && !POST_STATUSES.includes(status)) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'Invalid status filter'
    );
  }

  const filter = {
    userId: req.user.id
  };

  if (platform) {
    filter.platform = platform;
  }

  if (status) {
    filter.status = status;
  }

  if (cursor) {
    const decodedCursor = decodeCursor(cursor);

    if (
      !decodedCursor ||
      !decodedCursor.scheduledAt ||
      !decodedCursor.id ||
      Number.isNaN(new Date(decodedCursor.scheduledAt).getTime()) ||
      !mongoose.isValidObjectId(decodedCursor.id)
    ) {
      throw new AppError(
        400,
        'INVALID_CURSOR',
        'Invalid cursor'
      );
    }

    // Cursor pagination: fetch posts after the last post from the previous page.
    // Since posts are sorted by scheduledAt first, then _id, we get posts with a later
    // scheduledAt OR posts at the same scheduledAt with a greater _id as the tie-breaker.
    filter.$or = [
      {
        scheduledAt: {
          $gt: new Date(decodedCursor.scheduledAt)
        }
      },
      {
        scheduledAt: new Date(decodedCursor.scheduledAt),
        _id: {
          $gt: decodedCursor.id
        }
      }
    ];
  }

  // Extra post is fetched (limit + 1) to tell us if there are more posts after this
  const posts = await Post.find(filter)
    .sort({ scheduledAt: 1, _id: 1 })
    .limit(limit + 1);

  const hasNextPage = posts.length > limit;
  const pagePosts = hasNextPage ? posts.slice(0, limit) : posts;

  const nextCursor = hasNextPage
    ? encodeCursor(pagePosts[pagePosts.length - 1])
    : null;

  return res.status(200).json({
    data: pagePosts,
    page: {
      nextCursor
    }
  });
});

export const getPost = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(
      400,
      'INVALID_POST_ID',
      'Invalid post ID'
    );
  }

  const post = await Post.findOne({
    _id: id,
    userId: req.user.id
  });

  if (!post) {
    throw new AppError(
      404,
      'POST_NOT_FOUND',
      'Post not found'
    );
  }

  return res.status(200).json({
    data: post
  });
});

export const updatePost = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(
      400,
      'INVALID_POST_ID',
      'Invalid post ID'
    );
  }

  const updates = {};

  for (const field of POST_ALLOWED_UPDATES) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'At least one valid update field is required'
    );
  }

  if (updates.status && !POST_STATUSES.includes(updates.status)) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'Invalid status'
    );
  }

  if (
    updates.scheduledAt &&
    Number.isNaN(new Date(updates.scheduledAt).getTime())
  ) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'Invalid scheduledAt date'
    );
  }

  const post = await Post.findOneAndUpdate(
    {
      _id: id,
      userId: req.user.id
    },
    updates,
    {
      returnDocument: 'after',
      runValidators: true
    }
  );

  if (!post) {
    throw new AppError(
      404,
      'POST_NOT_FOUND',
      'Post not found'
    );
  }

  await invalidateUpcomingPostsCache(req.user.id);

  return res.status(200).json({
    data: post
  });
});

export const deletePost = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(400, 'INVALID_POST_ID', 'Invalid post ID');
  }

  const post = await Post.findOneAndUpdate(
    {
      _id: id,
      userId: req.user.id
    },
    {
      status: 'cancelled'
    },
    {
      returnDocument: 'after',
      runValidators: true
    }
  );

  if (!post) {
    throw new AppError(404, 'POST_NOT_FOUND', 'Post not found');
  }

  await invalidateUpcomingPostsCache(req.user.id);

  return res.status(204).send();
});

export const getUpcomingPosts = asyncHandler(async (req, res) => {
  const cachedPosts = await getCachedUpcomingPosts(req.user.id);

  if (cachedPosts !== null) {
    return res.status(200).json({
      data: cachedPosts,
      cache: {
        hit: true
      }
    });
  }

  const posts = await Post.find({
    userId: req.user.id,
    status: 'scheduled',
    scheduledAt: {
      $gt: new Date()
    }
  }).sort({ scheduledAt: 1, _id: 1 });

  await setCachedUpcomingPosts(req.user.id, posts);

  return res.status(200).json({
    data: posts,
    cache: {
      hit: false
    }
  });
});