# Schema Design

This project uses MongoDB with Mongoose. The core collections are `users`, `socialaccounts`, `posts`, and `postjobs`.

The main modeling choice is to keep the major entities as separate documents connected by `ObjectId` references. A social post scheduler needs to query posts independently, update job state independently, and keep user/account ownership clear. Embedding everything under a user would make the user document grow without a useful bound and would make pagination, filtering, and job updates harder.

## User

Represents the authenticated app user. Auth is stubbed for this project, but keeping a real `User` collection makes the rest of the schema realistic.

Fields:

- `email`: unique email for the user
- `name`: display name
- `createdAt` / `updatedAt`: Mongoose timestamps

### Embed vs Reference

`User` is a root document and is referenced by `SocialAccount`, `Post`, and `PostJob`.

I did not embed social accounts or posts inside the user because users can have many posts over time. Embedding posts would make the user document grow too large and would make `GET /posts` pagination/filtering less efficient. Referencing keeps user identity stable while allowing posts and jobs to be queried independently.

### Indexes

- `email` unique index: created by `unique: true`; supports finding the demo user in auth middleware and prevents duplicate users with the same email.

## SocialAccount

Represents an external social account connected to a user, such as a Twitter, Facebook, or LinkedIn account.

Fields:

- `userId`: reference to the owning `User`
- `platform`: platform enum, such as `twitter`, `facebook`, or `linkedin`
- `handle`: display handle for the account
- `externalAccountId`: platform-side account identifier
- `createdAt` / `updatedAt`: Mongoose timestamps

### Embed vs Reference

`SocialAccount` references `User` through `userId`.

I did not embed social accounts inside `User` because accounts are their own reusable resource. Posts need to reference the exact social account they will publish to, and that is cleaner when each account has its own `_id`. Referencing also lets the API validate ownership with a direct lookup:

```js
SocialAccount.findOne({ _id: socialAccountId, userId: req.user.id })
```

I did not embed posts inside `SocialAccount` because post lists are usually queried by user, status, platform, and schedule time, not only by account. Keeping posts separate supports those access patterns directly.

### Indexes

- `{ userId: 1 }`: added through `index: true`; supports fetching accounts owned by the current user.
- `{ userId: 1, platform: 1, externalAccountId: 1 }` unique: prevents one user from connecting the same external platform account more than once.
- `{ userId: 1, platform: 1 }`: supports fetching a user's accounts for a specific platform.

## Post

Represents a social post scheduled by a user.

Fields:

- `userId`: reference to the owning `User`
- `socialAccountId`: reference to the target `SocialAccount`
- `platform`: platform enum copied onto the post
- `content`: post body
- `status`: lifecycle status, such as `scheduled`, `publishing`, `published`, `failed`, or `cancelled`
- `scheduledAt`: time the post should publish
- `publishedAt`: time the worker marked the post as published
- `idempotencyKey`: client-provided key for safe retries of `POST /posts`
- `createdAt` / `updatedAt`: Mongoose timestamps

### Embed vs Reference

`Post` references both `User` and `SocialAccount`.

`userId` is stored directly on the post because nearly every post query is scoped to the current user. This avoids needing to join through `SocialAccount` just to enforce ownership or list a user's posts.

`socialAccountId` is a reference because account metadata can change separately from posts. A post only needs to know which account it targets; duplicating account fields into every post would create stale data if a handle or external account detail changed.

`platform` is intentionally duplicated on the post even though it also exists on `SocialAccount`. This is a small denormalization. It supports simple filtering with `GET /posts?platform=twitter` and lets the worker choose the formatting strategy without another account lookup. The controller validates that the requested platform matches the selected social account before creating the post.

I did not embed `PostJob` inside `Post` because the job has its own lifecycle and indexes. The worker updates job state independently from post content, and a separate collection makes it easier to find failed/dead jobs.

### Indexes

- `{ userId: 1 }`: added through `index: true`; supports user-scoped post lookups.
- `{ userId: 1, idempotencyKey: 1 }` unique: enforces idempotent `POST /posts` behavior per user. Retried create requests with the same key cannot create duplicate posts.
- `{ userId: 1, scheduledAt: 1 }`: supports upcoming post queries sorted by schedule time.
- `{ userId: 1, status: 1, scheduledAt: 1 }`: supports `GET /posts?status=scheduled` and other status-filtered lists while preserving schedule ordering.
- `{ userId: 1, platform: 1, scheduledAt: 1 }`: supports `GET /posts?platform=twitter` and other platform-filtered lists while preserving schedule ordering.

The cursor pagination sort is `{ scheduledAt: 1, _id: 1 }`. The indexes include `scheduledAt` for the main ordering. `_id` is used as a stable tie-breaker when multiple posts have the same scheduled time.

## PostJob

Represents the database-side state for a BullMQ publishing job.

Fields:

- `postId`: reference to the `Post` being published
- `userId`: reference to the owning `User`
- `bullJobId`: BullMQ job id
- `status`: job lifecycle status, such as `queued`, `processing`, `succeeded`, `failed`, `dead`, or `cancelled`
- `attempts`: latest attempt count recorded by the worker
- `lastError`: most recent failure reason
- `lockedAt`: time the worker began processing
- `completedAt`: time the job succeeded
- `failedAt`: time the job reached a failure/dead state
- `createdAt` / `updatedAt`: Mongoose timestamps

### Embed vs Reference

`PostJob` references `Post` through `postId` and references `User` through `userId`.

I kept `PostJob` separate from `Post` because queue processing has a different lifecycle from post editing. The worker needs to update job state repeatedly, and the app may need to inspect failed or dead jobs without scanning all posts. A separate collection also makes it clear that BullMQ state and post content are related but not the same thing.

`userId` is duplicated on `PostJob` even though it can be reached through `Post`. This is another small denormalization that supports user-scoped job history queries and avoids extra lookups when inspecting jobs.

### Indexes

- `{ userId: 1 }`: added through `index: true`; supports user-scoped job lookups.
- `{ postId: 1 }` unique: ensures each post has one active publishing job record in MongoDB.
- `{ status: 1, createdAt: 1 }`: supports operational queries such as finding queued, failed, or dead jobs in creation order.
- `{ userId: 1, createdAt: -1 }`: supports viewing a user's job history newest first.

## Summary of Tradeoffs

The schema favors references for independently changing resources: users, social accounts, posts, and jobs all have separate lifecycles. A few fields are intentionally duplicated (`Post.platform`, `PostJob.userId`) because they support common queries and keep route/worker code simple.

This creates some responsibility at the application layer: the controller must validate that a post's platform matches its social account, and job updates must keep `Post` and `PostJob` status aligned. For this project, that tradeoff is acceptable because it keeps the main API and worker access patterns straightforward.
