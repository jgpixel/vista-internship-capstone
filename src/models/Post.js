import mongoose from 'mongoose';
import { POST_PLATFORMS, POST_STATUSES } from '../constants/post.constants.js';

const postSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    socialAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SocialAccount',
      required: true
    },

    platform: {
      type: String,
      enum: POST_PLATFORMS,
      required: true
    },

    content: {
      type: String,
      required: true,
      trim: true,
      maxLength: 3000
    },

    status: {
      type: String,
      enum: POST_STATUSES,
      default: 'scheduled',
      required: true
    },

    scheduledAt: {
      type: Date,
      required: true
    },

    publishedAt: {
      type: Date,
      default: null
    },

    idempotencyKey: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Enforces per-user idempotency so retried POST /posts requests do not create duplicates.
postSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true }
);

// Optimizes upcoming-post lookups for a user, sorted by scheduledAt.
postSchema.index({ userId: 1, scheduledAt: 1 });

// Optimizes status-filtered post queries like GET /posts?status=scheduled.
postSchema.index({ userId: 1, status: 1, scheduledAt: 1 });

// Optimizes platform-filtered post queries like GET /posts?platform=twitter.
postSchema.index({ userId: 1, platform: 1, scheduledAt: 1 });

const Post = mongoose.model('Post', postSchema);

export default Post;