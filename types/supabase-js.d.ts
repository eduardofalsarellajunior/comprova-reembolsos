/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "@supabase/supabase-js" {
  export type SupabaseUser = { id: string; email?: string };
  export type SupabaseSession = { user: SupabaseUser; access_token: string };
  export type SupabaseResult<T> = { data: T; error: { message: string } | null };

  export type SupabaseClient = {
    auth: {
      getUser(token?: string): Promise<SupabaseResult<{ user: SupabaseUser | null }>>;
      getSession(): Promise<SupabaseResult<{ session: SupabaseSession | null }>>;
      signInWithPassword(credentials: { email: string; password: string }): Promise<SupabaseResult<{ user: SupabaseUser | null; session: SupabaseSession | null }>>;
      signUp(options: { email: string; password: string; options?: { emailRedirectTo?: string } }): Promise<SupabaseResult<{ user: SupabaseUser | null; session: SupabaseSession | null }>>;
      signOut(): Promise<unknown>;
      onAuthStateChange(callback: (event: string, session: SupabaseSession | null) => void): { data: { subscription: { unsubscribe(): void } } };
    };
    from(table: string): any;
    storage: { from(bucket: string): any };
  };

  export function createClient(url: string, key: string, options?: unknown): SupabaseClient;
}
