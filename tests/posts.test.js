import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

jest.unstable_mockModule('../src/config/queue.js', () => ({
  postQueue: {
    add: jest.fn().mockResolvedValue({
      id: 'test-bull-job-id'
    })
  },
  postDeadLetterQueue: {
    add: jest.fn().mockResolvedValue({
      id: 'test-dlq-job-id'
    })
  },
  connection: {}
}));

jest.unstable_mockModule('../src/services/cache.service.js', () => ({
  getCachedUpcomingPosts: jest.fn().mockResolvedValue(null),
  setCachedUpcomingPosts: jest.fn().mockResolvedValue(undefined),
  invalidateUpcomingPostsCache: jest.fn().mockResolvedValue(undefined)
}));

const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/models/User.js');
const { default: SocialAccount } = await import('../src/models/SocialAccount.js');

let mongoServer;
let socialAccount;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();

  await mongoose.connect(mongoServer.getUri());
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();

  const user = await User.create({
    email: 'demo@example.com',
    name: 'Demo User'
  });

  socialAccount = await SocialAccount.create({
    userId: user._id,
    platform: 'twitter',
    handle: '@demo',
    externalAccountId: 'twitter-demo-1'
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

function createPostPayload(overrides = {}) {
  return {
    socialAccountId: socialAccount._id.toString(),
    platform: 'twitter',
    content: 'Hello world',
    scheduledAt: '2026-06-10T15:00:00.000Z',
    ...overrides
  };
}

test('POST /posts creates a scheduled post', async () => {
  const res = await request(app)
    .post('/posts')
    .set('Idempotency-Key', 'create-test-1')
    .send(createPostPayload());

  expect(res.statusCode).toBe(201);
  expect(res.body.data.content).toBe('Hello world');
  expect(res.body.data.status).toBe('scheduled');
  expect(res.body.data.platform).toBe('twitter');
});

test('POST /posts with same Idempotency-Key returns existing post', async () => {
  const firstRes = await request(app)
    .post('/posts')
    .set('Idempotency-Key', 'same-key-1')
    .send(createPostPayload());

  const secondRes = await request(app)
    .post('/posts')
    .set('Idempotency-Key', 'same-key-1')
    .send(createPostPayload({
      content: 'Different content'
    }));

  expect(firstRes.statusCode).toBe(201);
  expect(secondRes.statusCode).toBe(200);
  expect(secondRes.body.data._id).toBe(firstRes.body.data._id);
  expect(secondRes.body.data.content).toBe('Hello world');
});

test('GET /posts filters by status', async () => {
  await request(app)
    .post('/posts')
    .set('Idempotency-Key', 'filter-test-1')
    .send(createPostPayload());

  const res = await request(app).get('/posts?status=scheduled');

  expect(res.statusCode).toBe(200);
  expect(res.body.data.length).toBe(1);
  expect(res.body.data[0].status).toBe('scheduled');
});

test('GET /posts returns nextCursor when there are more posts', async () => {
  await request(app)
    .post('/posts')
    .set('Idempotency-Key', 'page-test-1')
    .send(createPostPayload({
      scheduledAt: '2026-06-10T15:00:00.000Z'
    }));

  await request(app)
    .post('/posts')
    .set('Idempotency-Key', 'page-test-2')
    .send(createPostPayload({
      scheduledAt: '2026-06-11T15:00:00.000Z'
    }));

  const res = await request(app).get('/posts?limit=1');

  expect(res.statusCode).toBe(200);
  expect(res.body.data.length).toBe(1);
  expect(res.body.page.nextCursor).toBeTruthy();
});

test('DELETE /posts/:id cancels a post', async () => {
  const createRes = await request(app)
    .post('/posts')
    .set('Idempotency-Key', 'delete-test-1')
    .send(createPostPayload());

  const postId = createRes.body.data._id;

  const deleteRes = await request(app).delete(`/posts/${postId}`);

  expect(deleteRes.statusCode).toBe(204);

  const getRes = await request(app).get(`/posts/${postId}`);

  expect(getRes.statusCode).toBe(200);
  expect(getRes.body.data.status).toBe('cancelled');
});