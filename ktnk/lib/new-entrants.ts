import { unstable_cache } from "next/cache";
import { DATA_CACHE_TAGS } from "@/lib/data-cache";
import { createServerClient } from "@/lib/supabase";

const getCachedNewEntrants = unstable_cache(
  async (from: string, to: string, primaryCompany: string) => {
    let query = createServerClient()
      .from("new_entrant_records")
      .select("id,entry_date,primary_company,secondary_company,person_count,person_names,nationality_status,notes,created_at,updated_at")
      .order("entry_date")
      .order("primary_company");
    if (from) query = query.gte("entry_date", from);
    if (to) query = query.lte("entry_date", to);
    if (primaryCompany) query = query.eq("primary_company", primaryCompany);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },
  ["new-entrants-v1"],
  { tags: [DATA_CACHE_TAGS.entrants], revalidate: 5 * 60 },
);

export function getNewEntrants(from?: string | null, to?: string | null, primaryCompany?: string | null) {
  return getCachedNewEntrants(from ?? "", to ?? "", primaryCompany?.trim() ?? "");
}
