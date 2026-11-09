// The "Find jobs" feed: software jobs in Singapore from MyCareersFuture, fetched once a day by
// a GitHub Actions workflow (.github/workflows/data.yml runs tools/fetch-jobs.mjs) and saved
// to the repository's `data` branch, which the Job Tracker reads.

export const FEED_URL = 'https://raw.githubusercontent.com/mangoomeh/pocket-apps/data/jobs.json';

// What the workflow searches for. Results are merged and de-duplicated.
export const SEARCHES = [
  'software engineer', 'software developer', 'frontend developer', 'backend developer', 'full stack developer',
  'mobile developer', 'devops engineer', 'site reliability engineer', 'data engineer', 'machine learning engineer',
];

// Searches also match roles that aren't software (a "frontend" sales role, say), so titles must look like one.
const TECH_TITLE = /engineer|developer|programmer|devops|\bsre\b|architect|software|full[ -]?stack|front[ -]?end|back[ -]?end/i;
const NOT_TECH = /\b(sales|technician|mechanical|civil|electrical|m&e|mep|hvac|acmv|facilit\w*|building|structural|marine|process|chemical|quantity surveyor|aircraft|cad drafter|field service|service engineer|project engineer|maintenance|piping|mechatronics)\b/i;
export const looksLikeSoftware = (title) => TECH_TITLE.test(title) && !NOT_TECH.test(title);

const text = (s, max = 120) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// A MyCareersFuture job, as the small record the app shows; null if it isn't one to list.
export function fromMcf(r) {
  if (!r?.uuid || !r.title || r.address?.isOverseas) return null;
  if (!looksLikeSoftware(r.title)) return null;
  const meta = r.metadata || {};
  const url = String(meta.jobDetailsUrl || '');
  if (!url.startsWith('https://www.mycareersfuture.gov.sg/')) return null;
  const monthly = r.salary?.type?.salaryType === 'Monthly' && !meta.isHideSalary;
  const company = r.hiringCompany?.name || r.postedCompany?.name || '';
  const skills = [...(r.skills || [])].sort((a, b) => (b.isKeySkill ? 1 : 0) - (a.isKeySkill ? 1 : 0)).map((s) => text(s.skill, 40)).filter(Boolean);
  return {
    id: String(r.uuid),
    title: text(r.title),
    company: meta.isHideEmployerName ? '' : titleCase(text(company)),
    agency: !!(r.hiringCompany && r.postedCompany && r.hiringCompany.name !== r.postedCompany.name),
    min: monthly && r.salary.minimum > 0 ? Math.round(r.salary.minimum) : null,
    max: monthly && r.salary.maximum > 0 ? Math.round(r.salary.maximum) : null,
    level: (r.positionLevels || []).map((p) => text(p.position, 40)).filter(Boolean),
    types: (r.employmentTypes || []).map((t) => text(t.employmentType, 30)).filter(Boolean),
    years: Number.isFinite(r.minimumYearsExperience) ? r.minimumYearsExperience : null,
    area: text(r.address?.districts?.[0]?.location || '', 60),
    flexible: (r.flexibleWorkArrangements || []).map((f) => text(f.flexibleWorkArrangement, 30)).filter(Boolean),
    skills: [...new Set(skills)].slice(0, 8),
    posted: /^\d{4}-\d{2}-\d{2}$/.test(meta.newPostingDate) ? meta.newPostingDate : '',
    applicants: Number.isFinite(meta.totalNumberJobApplication) ? meta.totalNumberJobApplication : null,
    url,
  };
}

// "CORVANTA TRADING PTE. LTD." reads better as "Corvanta Trading Pte. Ltd.".
export function titleCase(s) {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s(&/-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

// Merges search results: one record per job, newest posting first.
export function mergeFeed(lists, max = 800) {
  const byId = new Map();
  for (const list of lists) for (const r of list) { const j = fromMcf(r); if (j && !byId.has(j.id)) byId.set(j.id, j); }
  return [...byId.values()].sort((a, b) => b.posted.localeCompare(a.posted) || (b.max || 0) - (a.max || 0)).slice(0, max);
}

// ---- In the app ------------------------------------------------------------------------------

// MyCareersFuture's position levels, grouped.
export const LEVELS = [
  { id: 'all', label: 'Any level' },
  { id: 'entry', label: 'Entry', match: /^(fresh\/entry level|junior executive|non-executive)$/i },
  { id: 'mid', label: 'Mid', match: /^(executive|professional)$/i },
  { id: 'senior', label: 'Senior', match: /^(senior executive|manager|middle management)$/i },
  { id: 'lead', label: 'Lead', match: /^senior management$/i },
];

// Jobs matching a search (title, company, skills), a minimum monthly salary and a level.
export function filterFeed(jobs, { query = '', minSalary = 0, level = 'all' } = {}) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lv = LEVELS.find((l) => l.id === level);
  return jobs.filter((j) => {
    if (minSalary && !((j.max || j.min || 0) >= minSalary)) return false;
    if (lv?.match && !j.level.some((l) => lv.match.test(l))) return false;
    const hay = `${j.title} ${j.company} ${j.skills.join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function salaryText(j) {
  const k = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}k`.replace('.0k', 'k') : String(n));
  if (j.min && j.max && j.min !== j.max) return `$${k(j.min)}–${k(j.max)}`;
  if (j.max || j.min) return `$${k(j.max || j.min)}`;
  return '';
}

// A feed job as a Job Tracker application on the wishlist (fields as newJob in src/jobs.js takes).
export function toTracker(j) {
  return {
    company: j.company || 'Company not shown',
    role: j.title,
    stage: 'wishlist',
    salary: salaryText(j) ? `${salaryText(j)}/month` : '',
    location: [j.area, j.flexible.length ? j.flexible.join(', ') : ''].filter(Boolean).join(' · '),
    link: j.url,
    notes: [j.skills.length ? `Skills: ${j.skills.join(', ')}` : '', j.years ? `${j.years}+ years' experience` : '', 'From MyCareersFuture'].filter(Boolean).join('\n'),
  };
}
