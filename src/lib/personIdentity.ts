export function formatPersonName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((part) => part
      .split(/([-'’])/)
      .map((segment) => segment && segment.toLocaleLowerCase() !== segment.toLocaleUpperCase()
        ? segment.charAt(0).toLocaleUpperCase() + segment.slice(1).toLocaleLowerCase()
        : segment)
      .join(''))
    .join(' ');
}

export function validatePersonIdentity(fullName: unknown, phone: unknown): string | null {
  const name = typeof fullName === 'string' ? fullName.trim() : '';
  const phoneValue = typeof phone === 'string' ? phone.trim() : '';

  if (!name || !phoneValue) return 'Name and phone are required';
  if (name.toLocaleLowerCase() === name.toLocaleUpperCase()) return 'Enter a name that includes letters';

  const phoneDigits = phoneValue.replace(/\D/g, '');
  if (phoneDigits.length < 7) return 'Enter a valid phone number';

  return null;
}
