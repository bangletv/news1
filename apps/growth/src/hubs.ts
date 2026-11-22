import type { ContractContinent, ContractPillar, PublicItem } from '../../api/src/contract.ts';

export interface HubCopyTemplate {
  slug: string;
  title: string;
  intro: string;
}

// Human-written British English intro templates (marked TODO[copy] for editorial refinement; never AI-generated).
export const HUB_TEMPLATES: Record<string, HubCopyTemplate> = {
  deadlines: {
    slug: 'deadlines',
    title: 'Upcoming Deadlines Calendar',
    intro:
      'TODO[copy]: Verified scholarships, research grants, fellowships, and public opportunities ordered by closing date directly from official institutional feeds.',
  },
  global: {
    slug: 'global',
    title: 'Global Institutional Feed',
    intro:
      'TODO[copy]: Verified announcements and international programmes published directly by multilateral agencies, research councils, and universities.',
  },
};

export function assembleDeadlineCalendar(items: PublicItem[], now = new Date()): PublicItem[] {
  const nowMs = now.getTime();
  return items
    .filter((i) => i.verification_status === 'verified' && i.deadline_at && Date.parse(i.deadline_at) >= nowMs)
    .sort((a, b) => Date.parse(a.deadline_at!) - Date.parse(b.deadline_at!));
}

export function assembleHub(
  items: PublicItem[],
  filter: { continent?: ContractContinent; country?: string; pillar?: ContractPillar }
): PublicItem[] {
  return items.filter((i) => {
    if (i.verification_status !== 'verified') return false;
    if (filter.continent && i.continent !== filter.continent) return false;
    if (filter.country && i.country !== filter.country) return false;
    if (filter.pillar && i.pillar !== filter.pillar) return false;
    return true;
  });
}
