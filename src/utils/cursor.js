export function encodeCursor(post) {
  return Buffer.from(
    JSON.stringify({
      scheduledAt: post.scheduledAt.toISOString(),
      id: post._id.toString()
    })
  ).toString('base64url');
}

export function decodeCursor(cursor) {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}