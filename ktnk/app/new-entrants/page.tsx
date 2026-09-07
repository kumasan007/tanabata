import { NewEntrantForm } from "@/components/new-entrant-form";
import { todayInTokyoString } from "@/lib/utils";

export const dynamic = "force-dynamic";
export default function NewEntrantsPage() { return <NewEntrantForm today={todayInTokyoString()} />; }
