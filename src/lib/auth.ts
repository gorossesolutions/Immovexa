import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Role = "admin" | "agent" | "owner" | "tenant";

export interface Profile {
  id: string;
  organization_id: string;
  role: Role;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const session = await getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

export function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function signInWithMagicLink(email: string) {
  return supabase.auth.signInWithOtp({ email });
}

export async function signOut() {
  await supabase.auth.signOut();
}

export function onAuthStateChange(callback: (session: Session | null) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session));
}

export function homeForRole(role: Role): string {
  switch (role) {
    case "admin":
    case "agent":
      return "/admin";
    case "owner":
      return "/owner";
    case "tenant":
      return "/tenant";
  }
}
