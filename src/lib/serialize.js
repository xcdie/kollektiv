function serializeAuthor(author) {
  return author
    ? { id: author.id, name: author.name, avatarUrl: author.avatar_url || null, isGuide: !!author.is_guide }
    : { id: null, name: 'Deleted member', avatarUrl: null, isGuide: false };
}

function threadSummary(row, author, replyCount, likeCount, likedByCurrentUser) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    imageUrl: row.image_url || null,
    author: serializeAuthor(author),
    createdAt: row.created_at,
    replyCount,
    likeCount: Number(likeCount || 0),
    liked: !!likedByCurrentUser,
  };
}

function threadDetail(row, author, replies, likeCount, likedByCurrentUser) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    imageUrl: row.image_url || null,
    author: serializeAuthor(author),
    createdAt: row.created_at,
    likeCount: Number(likeCount || 0),
    liked: !!likedByCurrentUser,
    replies,
  };
}

function reply(row, author, likeCount, likedByCurrentUser) {
  return {
    id: row.id,
    body: row.body,
    author: serializeAuthor(author),
    isHelpful: !!row.is_helpful,
    likeCount: Number(likeCount || 0),
    liked: !!likedByCurrentUser,
    createdAt: row.created_at,
  };
}

module.exports = {
  basicUser,
  publicUser,
  skill,
  project,
  circle,
  threadSummary,
  threadDetail,
  reply,
  opportunity,
  recognition,
};