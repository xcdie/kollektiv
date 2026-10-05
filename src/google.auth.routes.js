
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const MEMBER_TYPES = ['explorer', 'emerging', 'practitioner', 'hiring'];

// ---- ADAPT THESE THREE to match your existing code (see your /auth/login route) ----
const db = require('../lib/db');                       // your db module
const { signToken } = require('../lib/auth');          // whatever your login route uses to make the JWT
const { newId } = require('../lib/id');                // your id generator
// -----------------------------------------------------------------------------------

// Add inside your auth router:  router.post('/google', googleAuth);
async function googleAuth(req, res, next) {
  try {
    const { credential, memberType } = req.body || {};
    if (typeof credential !== 'string' || !credential) {
      return res.status(400).json({ error: { message: 'Missing Google credential.' } });
    }

    // 1. Verify the signed ID token with Google. Never trust a name/email from the client.
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (e) {
      return res.status(401).json({ error: { message: 'Google sign-in could not be verified.' } });
    }

    if (!payload || !payload.email || !payload.email_verified) {
      return res.status(401).json({ error: { message: 'Your Google email is not verified.' } });
    }

    const email = payload.email.toLowerCase();
    const name = payload.name || email.split('@')[0];

    // 2. Find the user, or create one (ADAPT the query style to your db module).
    let user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      const type = MEMBER_TYPES.includes(memberType) ? memberType : 'explorer';
      const id = newId();
      await db.run(
        'INSERT INTO users (id, name, email, password_hash, member_type, avatar_url) VALUES (?, ?, ?, ?, ?, ?)',
        [id, name, email, null, type, payload.picture || '']
      );
      user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    }

    // 3. Issue the same kind of token your /auth/login returns.
    const token = signToken({ id: user.id });
    return res.json({ token });
  } catch (err) {
    next(err);
  }
}

module.exports = { googleAuth };