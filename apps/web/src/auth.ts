import { createClient } from "@supabase/supabase-js";

// Public project identifiers; never put service_role/secret keys in this module.
export const authUrl = "https://dhpxzwgkbkkvjiisnkbc.supabase.co";
export const publicKey = "sb_publishable_3rMpMTnP-uTflB9u_vtMTA_kXF_hTei";
export const loginClient = createClient(authUrl, publicKey, {
  auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true },
});
