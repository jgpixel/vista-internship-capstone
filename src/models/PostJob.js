import mongoose from 'mongoose';

const postJobSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    bullJobId: {
      type: String,
      default: null
    },

    status: {
      type: String,
      enum: ['queued', 'processing', 'succeeded', 'failed', 'dead', 'cancelled'],
      default: 'queued',
      required: true
    },

    attempts: {
      type: Number,
      default: 0
    },

    lastError: {
      type: String,
      default: null
    },

    lockedAt: {
      type: Date,
      default: null
    },

    completedAt: {
      type: Date,
      default: null
    },

    failedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Ensures each post has one publishing job record.
postJobSchema.index({ postId: 1 }, { unique: true });

// Supports finding jobs by status, like queued, failed, or dead.
postJobSchema.index({ status: 1, createdAt: 1 });

// Supports viewing a user's job history.
postJobSchema.index({ userId: 1, createdAt: -1 });

const PostJob = mongoose.model('PostJob', postJobSchema);

export default PostJob;