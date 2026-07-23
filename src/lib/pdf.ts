import { supabase } from "./supabase";
import { showToast } from "../components/toast";

export async function downloadChargePdf(chargeId: string, type: "receipt" | "notice", fileName: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const url = `${supabaseUrl}/functions/v1/generate-charge-pdf?charge_id=${chargeId}&type=${type}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });

  if (!response.ok) {
    showToast("Erreur lors de la génération du document", "error");
    return;
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}
