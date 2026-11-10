(async () => {
  const HOME = '../../index.html';
  const show = () => { document.documentElement.style.visibility = 'visible'; };
  const leave = () => location.replace(HOME);

  // ---------- Supabase auth guard ----------
  if (!window.supabase || !window.supabase.createClient) return leave();
  const db = window.supabase.createClient(
    'https://kidfwfzzoetisryjnnlh.supabase.co',
    'sb_publishable_Dw-lSo7BWbtF-oihZt7QBA_i_2wV8Dn'
  );

  let session = null;
  try {
    const r = await db.auth.getSession();
    session = r.data && r.data.session;
    if (session) {
      // confirm the account still exists on the server
      const u = await db.auth.getUser();
      if (u.error || !u.data || !u.data.user) session = null;
    }
  } catch (e) { session = null; }

  if (!session || !session.user) return leave();

  // ---------- render ----------
  const user = session.user;
  const params = new URLSearchParams(location.search);
  const v = params.get('v') === 'notion' ? 'Notion' : 'GitHub';
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

  set('userEmail', user.email || '');
  set('who', user.email || 'to your dashboard');
  set('provider', 'Provider: ' + v);
  set('accProvider', v);
  set('accEmail', user.email || user.id);
  set('accSession', 'Signed in ' + new Date(user.last_sign_in_at || Date.now()).toLocaleString());

  // ---------- sign out ----------
  const out = document.getElementById('signOut');
  if (out) out.addEventListener('click', async () => {
    try { await db.auth.signOut(); } catch (e) {}
    leave();
  });

  // ---------- leave if the session ends elsewhere ----------
  db.auth.onAuthStateChange((event, s) => { if (event === 'SIGNED_OUT' || !s) leave(); });

  show();
})();
