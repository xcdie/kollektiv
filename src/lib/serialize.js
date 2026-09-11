function basicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url || null,
    memberType: row.member_type,
    isGuide: !!row.is_guide,
  };
}

// Public profile: anyone can see this about any member. No email.
function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    avatarUrl: row.avatar_url || null,
    memberType: row.member_type,
    goal: row.goal,
    isGuide: !!row.is_guide,
    guideRole: row.guide_role || null,
    guideFocus: row.guide_focus || null,
    createdAt: row.created_at,
  };
}

function skill(row) {
  return { id: row.id, name: row.name, status: row.status };
}

function project(row) {
  return { id: row.id, title: row.title, description: row.description, link: row.link || null };
}

function circle(row, threadCount) {
  return { id: row.id, slug: row.slug, name: row.name, description: row.description, threadCount };
}

function threadSummary(row, author, replyCount, likeCount, likedByCurrentUser) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    imageUrl: row.image_url || null,
    author: { id: author.id, name: author.name, avatarUrl: author.avatar_url || null, isGuide: !!author.is_guide },
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
    author: { id: author.id, name: author.name, avatarUrl: author.avatar_url || null, isGuide: !!author.is_guide },
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
    author: { id: author.id, name: author.name, avatarUrl: author.avatar_url || null, isGuide: !!author.is_guide },
    isHelpful: !!row.is_helpful,
    likeCount: Number(likeCount || 0),
    liked: !!likedByCurrentUser,
    createdAt: row.created_at,
  };
}

function opportunity(row, interested) {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    type: row.type,
    location: row.location,
    pay: row.pay,
    blurb: row.blurb,
    payVerified: !!row.pay_verified,
    interested: !!interested,
  };
}

function recognition(row, fromUser) {
  return {
    id: row.id,
    text: row.text,
    from: fromUser ? fromUser.name : 'a Kollektiv member',
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
