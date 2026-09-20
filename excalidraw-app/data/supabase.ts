import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_APP_SUPABASE_URL;
const supabasePublishableKey = import.meta.env
  .VITE_APP_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Missing Supabase environment configuration.");
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
