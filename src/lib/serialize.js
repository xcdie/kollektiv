// src/lib/serialize.js

function basicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name || user.username || null,
    email: user.email || null,
    avatarUrl:
      user.avatar_url ||
      user.avatarUrl ||
      null,
    memberType:
      user.member_type ||
      user.memberType ||
      'explorer',
    isGuide: !!user.is_guide,
  };
}

function publicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name || user.username || null,
    avatarUrl:
      user.avatar_url ||
      user.avatarUrl ||
      null,
    memberType:
      user.member_type ||
      user.memberType ||
      'explorer',
    isGuide: !!user.is_guide,
  };
}

function serializeAuthor(author) {
  return author
    ? {
        id: author.id,
        name:
          author.name ||
          author.username ||
          'Unknown member',
        avatarUrl:
          author.avatar_url ||
          author.avatarUrl ||
          null,
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
    status: row.status || 'learning',
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
    link: row.link || null,
    imageUrl:
      row.image_url ||
      row.imageUrl ||
      null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function circle(row, threadCount) {
  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug || null,
    name: row.name || null,
    description: row.description || null,
    imageUrl:
      row.image_url ||
      row.imageUrl ||
      null,
    threadCount: Number(threadCount || 0),
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
    replyCount: Number(replyCount || 0),
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

function reply(
  row,
  author,
  likeCount,
  likedByCurrentUser
) {
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

function opportunity(row, interested = false) {
  if (!row) return null;

  return {
    id: row.id,
    title: row.title || null,
    description:
      row.description ||
      row.blurb ||
      null,
    blurb:
      row.blurb ||
      row.description ||
      null,
    company: row.company || null,
    location: row.location || null,
    type: row.type || null,
    pay: row.pay || null,
    payVerified: !!row.pay_verified,
    interested: !!interested,
    imageUrl:
      row.image_url ||
      row.imageUrl ||
      null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function recognition(row, fromUser = null) {
  if (!row) return null;

  return {
    id: row.id,
    text: row.text || '',
    from: fromUser
      ? fromUser.name || 'Member'
      : 'Kollektiv',
    fromUser: fromUser
      ? {
          id: fromUser.id || null,
          name:
            fromUser.name ||
            'Member',
        }
      : null,
    createdAt: row.created_at || null,
  };
}

module.exports = {
  basicUser,
  publicUser,
  serializeAuthor,
  skill,
  project,
  circle,
  threadSummary,
  threadDetail,
  reply,
  opportunity,
  recognition,
};