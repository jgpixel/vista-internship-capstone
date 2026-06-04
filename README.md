# Mini Social Post Scheduler

A small end-to-end Node.js project for scheduling social media posts. The app uses Express for the API, MongoDB for persisted data, Redis for caching, and BullMQ for delayed publishing jobs.

Publishing is intentionally stubbed: when a scheduled post is processed, the worker formats the post for the target platform and logs it to the console.

## Tech Stack

- Node.js
- Express
- MongoDB with Mongoose
- Redis
- BullMQ
- Jest and Supertest

## Features

- Stubbed auth middleware that attaches `req.user`
- MongoDB models for users, social accounts, posts, and post jobs
- Idempotent `POST /posts` using the `Idempotency-Key` header
- Cursor-paginated `GET /posts`
- Platform and status filtering
- Scheduled BullMQ publishing jobs
- Retry handling with exponential backoff
- Dead-letter queue after final job failure
- Redis cache for upcoming posts per user
- Centralized error handling with consistent response shapes
- Platform formatting strategy pattern

## Setup

Install dependencies:

```bash
npm install
```

Create a local `.env` file:

```bash
cp .env.example .env
```

Default environment values:

```bash
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017/vista_internship_capstone
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

Make sure MongoDB and Redis are running locally before starting the app.

## Running the App

Start the API server:

```bash
npm run dev
```

In a second terminal, start the publishing worker:

```bash
npm run worker
```

The API runs at:

```text
http://localhost:3000
```

## Demo User and Social Account

Auth is stubbed. The first request to an authenticated route creates or finds this demo user:

```text
demo@example.com
```

The app validates that posts belong to a social account, so create one before posting. First trigger the demo user:

```bash
curl http://localhost:3000/posts
```

Then in `mongosh`:

```js
use vista_internship_capstone

const user = db.users.findOne({ email: 'demo@example.com' })

db.socialaccounts.insertOne({
  userId: user._id,
  platform: 'twitter',
  handle: '@demo',
  externalAccountId: 'twitter-demo-1',
  createdAt: new Date(),
  updatedAt: new Date(),
})
```

Copy the inserted social account `_id` for manual API testing.

## API Endpoints

### Create Post

```http
POST /posts
```

Requires an `Idempotency-Key` header.

```bash
curl -i -X POST http://localhost:3000/posts \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-key-1" \
  -d '{
    "socialAccountId": "PASTE_SOCIAL_ACCOUNT_ID",
    "platform": "twitter",
    "content": "Testing a scheduled post.",
    "scheduledAt": "2026-06-03T22:45:00.000Z"
  }'
```

Calling the same request again with the same `Idempotency-Key` returns the existing post instead of creating a duplicate.

### List Posts

```http
GET /posts
```

Supports cursor pagination and optional filters:

```bash
curl -i "http://localhost:3000/posts?platform=twitter&status=scheduled&limit=5"
```

If more results exist, the response includes:

```json
{
  "page": {
    "nextCursor": "..."
  }
}
```

Use that cursor on the next request:

```bash
curl -i "http://localhost:3000/posts?cursor=PASTE_CURSOR"
```

### Get One Post

```http
GET /posts/:id
```

```bash
curl -i http://localhost:3000/posts/PASTE_POST_ID
```

### Update Post

```http
PATCH /posts/:id
```

Updates allowed fields on a post. If `scheduledAt` changes while the post is still scheduled, the BullMQ publishing job is rescheduled.

```bash
curl -i -X PATCH http://localhost:3000/posts/PASTE_POST_ID \
  -H "Content-Type: application/json" \
  -d '{
    "scheduledAt": "2026-06-03T22:43:00.000Z"
  }'
```

### Delete Post

```http
DELETE /posts/:id
```

This cancels the post by setting its status to `cancelled`.

```bash
curl -i -X DELETE http://localhost:3000/posts/PASTE_POST_ID
```

### Upcoming Posts

```http
GET /posts/upcoming
```

Returns scheduled future posts for the current user. Results are cached in Redis and invalidated on create, update, delete, and successful/failed publishing.

```bash
curl -i http://localhost:3000/posts/upcoming
```

## Error Shape

Errors use a consistent JSON shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid platform"
  }
}
```

Server errors return a generic message instead of leaking stack traces.

## Job Processing

When a post is created, the API adds a delayed BullMQ job based on `scheduledAt`.

The worker:

- Checks the `PostJob` record before publishing
- Skips work if the post was already published or cancelled
- Formats content using the platform strategy
- Logs the publish action
- Marks the post as `published`
- Retries failed jobs up to 3 times with exponential backoff
- Moves final failures into the dead-letter queue

## Tests

Run the test suite:

```bash
npm test
```

The tests use `mongodb-memory-server` and mock the queue/cache layers, so they do not require a real MongoDB or Redis instance.

## Project Structure

```text
src/
  app.js
  server.js
  config/
  controllers/
  middleware/
  models/
  routes/
  services/
  strategies/
  utils/
  workers/
tests/
  posts.test.js
```