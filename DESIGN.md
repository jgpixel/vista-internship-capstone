# Design

This project is a small social post scheduler built around a simple API plus a background worker. The API owns request validation, persistence, cache invalidation, and queue scheduling. The worker owns publishing behavior and job-state transitions.

## Strategy Pattern

The Strategy pattern is used for platform-specific post formatting.

Files:

- `src/strategies/platform.strategy.js`
- `src/strategies/twitter.strategy.js`
- `src/strategies/facebook.strategy.js`
- `src/strategies/linkedin.strategy.js`

Each platform strategy exposes the same interface:

```js
{
  format(content) {}
}
```

The worker asks for the correct strategy based on `post.platform`:

```js
const strategy = getPlatformStrategy(post.platform);
const formattedContent = strategy.format(post.content);
```

### Why This Pattern Fits

Different social platforms have different formatting rules. For example, Twitter/X has a shorter content limit, while LinkedIn and Facebook may allow longer text. Keeping that logic in separate strategy files prevents the worker from becoming a long `if/else` block.

### Tradeoffs

For only three platforms, a `switch` statement would work. I still used Strategy because platform behavior is likely to grow in a scheduler app. If another platform is added later, the change is mostly isolated to a new strategy file and the strategy map.

## Middleware / Pipeline Pattern

Express middleware is used as a request pipeline.

Files:

- `src/app.js`
- `src/middleware/auth.js`
- `src/middleware/errorHandler.js`
- `src/utils/asyncHandler.js`

The auth middleware attaches a stubbed user to API requests before they reach the post routes:

```js
req.user = {
  id: user._id.toString(),
  email: user.email,
  name: user.name
};
```

Controllers can then rely on `req.user` instead of repeating user lookup logic in every route.

The error middleware centralizes the response shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid platform"
  }
}
```

The `asyncHandler` wrapper sends async route errors to the centralized error middleware instead of requiring `try/catch` blocks in every controller.

### Why This Pattern Fits

Middleware is the normal Express way to compose cross-cutting behavior. Auth, JSON parsing, and error handling should not be duplicated inside each route handler.

### Tradeoffs

The current auth middleware is intentionally stubbed. In production, it would verify a session or token and would not create a hard-coded demo user. For this assignment, the stub still demonstrates the middleware pattern and keeps API handlers realistic.

## Idempotent Post Creation

`POST /posts` requires an `Idempotency-Key` header. The controller checks for an existing post with the same user and key before creating a new one:

```js
Post.findOne({ userId: req.user.id, idempotencyKey })
```

The database also enforces uniqueness with:

```js
{ userId: 1, idempotencyKey: 1 }
```

This lets a client safely retry a create request without creating duplicate posts.

### Tradeoffs

The current implementation handles normal retries well. A more production-ready version would also catch duplicate-key errors from concurrent requests and return the already-created post. The unique index is still important because it protects the database even if two requests race.

## Background Job Design

When a post is created, the API creates a delayed BullMQ job using the post's `scheduledAt` time. It also creates a `PostJob` document in MongoDB.

BullMQ is responsible for timing, retries, and backoff. MongoDB is responsible for durable application-level job state.

The worker is idempotent at the application level:

- If the `PostJob` is already `succeeded`, it returns.
- If the `Post` is already `published`, it marks the job as succeeded and returns.
- If the `Post` is `cancelled`, it marks the job as cancelled and returns.

On successful publishing, the worker marks the post as `published` and the job as `succeeded`.

On final failure, the worker marks the job as `dead`, marks the post as `failed`, and adds a record to the dead-letter queue.

### Tradeoffs

There is some duplicated state between BullMQ, `Post`, and `PostJob`. That is intentional for this project:

- BullMQ handles scheduling and retry mechanics.
- `Post.status` gives the API a simple user-facing status.
- `PostJob.status` gives the worker and developer a job-focused audit trail.

The cost is that the code must keep those states aligned. The worker does that explicitly.

## Cache-Aside Pattern

The upcoming posts endpoint uses Redis with a cache-aside approach.

File:

- `src/services/cache.service.js`

Read flow:

1. Try Redis for `upcoming-posts:user:{userId}`.
2. If found, return cached data.
3. If missing, query MongoDB.
4. Store the result in Redis with a short TTL.

Write flow:

- Create invalidates the user's upcoming-post cache.
- Update invalidates the cache.
- Delete/cancel invalidates the cache.
- Worker success/failure invalidates the cache.

### Tradeoffs

The cache TTL is short, and invalidation is explicit. That keeps the cache behavior simple and acceptable for a small scheduler. In a larger system, cache invalidation might move closer to domain events so every status transition uses the same path.

## Cursor Pagination

`GET /posts` uses cursor pagination instead of offset pagination.

Posts are sorted by:

```js
{ scheduledAt: 1, _id: 1 }
```

The cursor stores the last post's `scheduledAt` and `_id`. The next page fetches posts after that pair.

### Why Cursor Pagination

Cursor pagination is more stable than offset pagination when new posts are inserted while a user is paging through results. It also matches the main access pattern for this app: reading posts in scheduled order.

### Tradeoffs

Cursor pagination is more complex than `skip` and `limit`, and cursors are less human-readable. That tradeoff is worth it here because scheduled posts are naturally time-ordered.

## Error Handling

The app uses a small `AppError` class for expected errors. Controllers throw errors with:

- HTTP status code
- stable error code
- human-readable message

Unexpected errors return:

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Something went wrong"
  }
}
```

This avoids leaking stack traces to API clients.

## What I Kept Simple

Several pieces are intentionally simpler than a production app:

- Auth is stubbed with a demo user.
- Publishing is a `console.log`.
- There is no real social platform OAuth.
- There is no admin UI for the dead-letter queue.
- Validation is mostly controller-level rather than a full validation layer.
- Status transitions are not modeled as a full state machine.

Those choices keep the project focused on the required concepts: API design, middleware, MongoDB modeling, indexing, Redis caching, BullMQ scheduling, worker idempotency, retries, dead-letter handling, and tests.
