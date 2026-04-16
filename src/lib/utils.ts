export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function formatShortDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function getInitials(name: string): string {
  return name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

export function calculateAge(dob: string): number {
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function getAgeGroup(age: number): string {
  if (age < 20) return 'Under 20';
  if (age < 30) return '20-29';
  if (age < 40) return '30-39';
  if (age < 50) return '40-49';
  if (age < 60) return '50-59';
  return '60+';
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getDaysRemaining(endDate: string | null): number {
  if (!endDate) return 999;
  const end = new Date(endDate);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

const blessings = [
  { text: 'The Lord bless you and keep you', reference: 'Numbers 6:24' },
  { text: 'This is the day the Lord has made', reference: 'Psalm 118:24' },
  { text: 'The joy of the Lord is your strength', reference: 'Nehemiah 8:10' },
  { text: 'Enter his gates with thanksgiving', reference: 'Psalm 100:4' },
  { text: 'Trust in the Lord with all your heart', reference: 'Proverbs 3:5' },
  { text: 'Be strong and courageous', reference: 'Joshua 1:9' },
  { text: 'Cast all your anxiety on him', reference: '1 Peter 5:7' },
  { text: 'His mercies are new every morning', reference: 'Lamentations 3:23' },
];

export function getRandomBlessing(): { text: string; reference: string } {
  return blessings[Math.floor(Math.random() * blessings.length)];
}
