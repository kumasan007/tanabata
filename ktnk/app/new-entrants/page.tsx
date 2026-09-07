import { NewEntrantForm } from "@/components/new-entrant-form";
import { todayInTokyoString } from "@/lib/utils";
import { getCompanyMaster } from "@/lib/companies";

export const revalidate = 3600;
export default async function NewEntrantsPage() {
  return <NewEntrantForm today={todayInTokyoString()} initialMaster={await getCompanyMaster()} />;
}
