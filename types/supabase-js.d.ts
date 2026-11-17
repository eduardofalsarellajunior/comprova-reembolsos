/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "@supabase/supabase-js" {
  export type SupabaseUser = {
    id: string;
    email?: string;
    email_confirmed_at?: string;
    last_sign_in_at?: string;
    identities?: { provider: string }[];
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  };
  export type SupabaseSession = { user: SupabaseUser; access_token: string };
  export type SupabaseResult<T> = { data: T; error: { message: string; code?: string } | null };

  export type SupabaseClient = {
    auth: {
      getUser(token?: string): Promise<SupabaseResult<{ user: SupabaseUser | null }>>;
      getSession(): Promise<SupabaseResult<{ session: SupabaseSession | null }>>;
      signInWithPassword(credentials: { email: string; password: string }): Promise<SupabaseResult<{ user: SupabaseUser | null; session: SupabaseSession | null }>>;
      signUp(options: { email: string; password: string; options?: { emailRedirectTo?: string } }): Promise<SupabaseResult<{ user: SupabaseUser | null; session: SupabaseSession | null }>>;
      updateUser(attributes: { data?: Record<string, unknown>; password?: string; nonce?: string }): Promise<SupabaseResult<{ user: SupabaseUser | null }>>;
      reauthenticate(): Promise<{ error: { message: string; code?: string } | null }>;
      linkIdentity(credentials: { provider: "azure"; options: { scopes: string; redirectTo: string } }): Promise<{ error: { message: string; code?: string } | null }>;
      signOut(options?: { scope: "local" | "global" | "others" }): Promise<{ error: { message: string } | null }>;
      onAuthStateChange(callback: (event: string, session: SupabaseSession | null) => void): { data: { subscription: { unsubscribe(): void } } };
    };
    from(table: string): any;
    rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<SupabaseResult<T>>;
    storage: { from(bucket: string): any };
  };

  export function createClient(url: string, key: string, options?: unknown): SupabaseClient;
}
