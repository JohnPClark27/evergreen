// Copy to web/config.js and fill in (Supabase dashboard -> Project Settings -> API).
// Both values are SAFE to publish: the anon/publishable key can only read what
// RLS allows (published content). NEVER put the service role key here.
window.HYMNAL_CONFIG = {
  supabaseUrl: 'https://<project-ref>.supabase.co',
  supabaseAnonKey: '<anon or publishable key>',
};
