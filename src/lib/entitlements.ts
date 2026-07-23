import { supabase } from "./supabase";

export async function hasEntitlement(organizationId: string, key: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_entitlement", {
    p_organization_id: organizationId,
    p_key: key,
  });
  if (error) return false;
  return Boolean(data);
}
