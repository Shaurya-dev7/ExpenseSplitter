// The managed preview sometimes supplies only the public database key.
// Prefer the server credential; use the supplied public key only when no server key exists.
// No credentials are sent to the frontend bundle.
if (!process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
