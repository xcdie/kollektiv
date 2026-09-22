// src/lib/serialize.js

function basicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name || user.username || null,
    email: user.email || null,
    avatarUrl: user.avatar_url || user.avatarUrl || null,
    isGuide: !!user.is_guide,
  };
}

function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name || user.username || null,
    avatarUrl: user.avatar_url || user.avatarUrl || null,
    isGuide: !!user.is_guide,
  };
}

function serializeAuthor(author) {
  return author
    ? {
        id: author.id,
        name: author.name || author.username || 'Unknown member',
        avatarUrl: author.avatar_url || author.avatarUrl || null,
        isGuide: !!author.is_guide,
      }
    : {
        id: null,
        name: 'Deleted member',
        avatarUrl: null,
        isGuide: false,
      };
}

function skill(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    description: row.description || null,
    createdAt: row.created_at || null,
  };
}

function project(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name || row.title || null,
    title: row.title || row.name || null,
    description: row.description || null,
    imageUrl: row.image_url || row.imageUrl || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function circle(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name || null,
    description: row.description || null,
    imageUrl: row.image_url || row.imageUrl || null,
    createdAt: row.created_at || null,
  };
}

function threadSummary(
  row,
  author,
  replyCount,
  likeCount,
  likedByCurrentUser
) {
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

function threadDetail(
  row,
  author,
  replies,
  likeCount,
  likedByCurrentUser
) {
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

function opportunity(row) {
  if (!row) return null;

  return {
    id: row.id,
    title: row.title || null,
    description: row.description || null,
    company: row.company || null,
    location: row.location || null,
    type: row.type || null,
    imageUrl: row.image_url || row.imageUrl || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function recognition(row) {
  if (!row) return null;

  return {
    id: row.id,
    title: row.title || null,
    description: row.description || null,
    recipientId: row.recipient_id || row.recipientId || null,
    createdAt: row.created_at || null,
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