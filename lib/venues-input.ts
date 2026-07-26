import type { VenueInput } from '@/lib/db/venues';

const LIMITS = {
  name: 255,
  address: 500,
  phone: 50,
  email: 255,
  contactName: 255,
  notes: 5000,
} as const;

// Deliberately lenient — enough to catch a fat-fingered address in the email
// field, not to police every valid address form.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim to a string, or null when empty. */
function opt(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : null;
}

/**
 * Validate + normalize a venue request body (shared by create and update).
 * `name` is required (1–255 chars); everything else is optional and length-
 * capped. Returns the clean input or a user-facing error message.
 */
export function parseVenueInput(
  body: unknown,
): { input: VenueInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) return { error: 'A venue name is required.' };
  if (name.length > LIMITS.name)
    return { error: `Name must be at most ${LIMITS.name} characters.` };

  const address = opt(b.address);
  const phone = opt(b.phone);
  const email = opt(b.email);
  const contactName = opt(b.contactName);
  const notes = opt(b.notes);

  if (address && address.length > LIMITS.address)
    return { error: `Address must be at most ${LIMITS.address} characters.` };
  if (phone && phone.length > LIMITS.phone)
    return { error: `Phone must be at most ${LIMITS.phone} characters.` };
  if (email && email.length > LIMITS.email)
    return { error: `Email must be at most ${LIMITS.email} characters.` };
  if (email && !EMAIL_RE.test(email))
    return { error: 'Enter a valid email address.' };
  if (contactName && contactName.length > LIMITS.contactName)
    return {
      error: `Contact name must be at most ${LIMITS.contactName} characters.`,
    };
  if (notes && notes.length > LIMITS.notes)
    return { error: `Notes must be at most ${LIMITS.notes} characters.` };

  return { input: { name, address, phone, email, contactName, notes } };
}
