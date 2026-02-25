export interface SkillInfo {
  name: string;
  description?: string;
}

let cachedSkills: SkillInfo[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchSkillsCached(): Promise<SkillInfo[]> {
  if (cachedSkills && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSkills;
  }
  const res = await fetch("/api/skills");
  const skills = await res.json();
  cachedSkills = Array.isArray(skills) ? skills : [];
  cacheTimestamp = Date.now();
  return cachedSkills;
}
