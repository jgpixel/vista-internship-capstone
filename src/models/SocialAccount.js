import mongoose from 'mongoose';
import { POST_PLATFORMS } from '../constants/post.constants.js';

const socialAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    platform: {
      type: String,
      enum: POST_PLATFORMS,
      required: true
    },

    handle: {
      type: String,
      required: true,
      trim: true
    },

    externalAccountId: {
      type: String,
      required: true,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Prevents one user from connecting the same platform account twice.
socialAccountSchema.index(
  { userId: 1, platform: 1, externalAccountId: 1 },
  { unique: true }
);

// Supports fetching all accounts for a user by platform.
socialAccountSchema.index({ userId: 1, platform: 1 });

const SocialAccount = mongoose.model('SocialAccount', socialAccountSchema);

export default SocialAccount;