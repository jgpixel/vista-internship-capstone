import mongoose from 'mongoose';
import Post from '../models/Post.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
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

  const post = await Post.create({
    userId: req.user.id,
    socialAccountId,
    platform,
    content,
    scheduledAt,
    idempotencyKey,
    status: 'scheduled',
  });

  return res.status(201).json({
    data: post
  });
});

export const getPosts = asyncHandler(async (req, res) => {
  const { platform, status } = req.query;

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

  const posts = await Post.find(filter).sort({ scheduledAt: 1 });

  return res.status(200).json({
    data: posts
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

  return res.status(204).send();
});