export const normalizeEmail = (email: unknown): string => {
  if (typeof email !== 'string') {
    return '';
  }

  return email.trim().toLowerCase();
};
