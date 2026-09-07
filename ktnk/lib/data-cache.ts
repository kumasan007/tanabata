import { revalidateTag } from "next/cache";

export const DATA_CACHE_TAGS = {
  companies: "company-master",
  schedules: "schedules",
  entrants: "new-entrants",
} as const;

function expire(tag: string) {
  revalidateTag(tag, { expire: 0 });
}

export function invalidateCompanyData() {
  expire(DATA_CACHE_TAGS.companies);
}

export function invalidateScheduleData() {
  expire(DATA_CACHE_TAGS.schedules);
}

export function invalidateEntrantData() {
  expire(DATA_CACHE_TAGS.entrants);
}

export function invalidateAllOperationalData() {
  invalidateCompanyData();
  invalidateScheduleData();
  invalidateEntrantData();
}
