// ===========================================================
// VCARD GENERATOR UTILITY
// ===========================================================
// Generates a vCard 3.0 formatted string from a user profile.
// vCard is the standard format phones use for contact import.
// When the user taps "Add to Contacts", this file is downloaded
// and the phone's OS handles saving it to the address book.
//
// We use vCard 3.0 (not 4.0) for maximum device compatibility —
// especially older Android and iOS versions.
// ===========================================================

import { PublicProfile } from '../types';

/**
 * Generates a vCard 3.0 string from a public profile object.
 * Returns the raw string to be sent as a .vcf file download.
 */
export function generateVCard(profile: PublicProfile): string {
  // vCard requires CRLF (\r\n) line endings per RFC 6350
  const CRLF = '\r\n';

  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
  ];

  // Full name — required field in vCard spec
  lines.push(`FN:${escapeVCardValue(profile.fullName)}`);

  // Structured name: Last;First;Middle;Prefix;Suffix
  // We don't capture structured name, so use full name in first position
  const nameParts = profile.fullName.split(' ');
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
  const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : nameParts[0];
  lines.push(`N:${escapeVCardValue(lastName)};${escapeVCardValue(firstName)};;;`);

  // Job title and organization
  if (profile.jobTitle) {
    lines.push(`TITLE:${escapeVCardValue(profile.jobTitle)}`);
  }
  if (profile.company) {
    lines.push(`ORG:${escapeVCardValue(profile.company)}`);
  }

  // Contact details — using TYPE parameter for context
  if (profile.phone) {
    lines.push(`TEL;TYPE=CELL:${profile.phone}`);
  }
  if (profile.email) {
    lines.push(`EMAIL;TYPE=WORK:${profile.email}`);
  }
  if (profile.website) {
    lines.push(`URL:${profile.website}`);
  }

  // Bio goes in the NOTE field
  if (profile.bio) {
    lines.push(`NOTE:${escapeVCardValue(profile.bio)}`);
  }

  // WhatsApp: stored as a URL link so tapping it on mobile opens WhatsApp
  if (profile.whatsapp) {
    lines.push(`X-SOCIALPROFILE;type=whatsapp:https://wa.me/${profile.whatsapp}`);
  }

  // Social links — non-standard but widely supported via X- extension fields
  for (const link of profile.links) {
    const type = link.type.toUpperCase();
    lines.push(`X-SOCIALPROFILE;type=${type}:${link.url}`);
  }

  lines.push('END:VCARD');

  return lines.join(CRLF);
}

/**
 * Escapes special characters in vCard field values.
 * Per RFC 6350: backslash, comma, semicolon, and newlines must be escaped.
 */
function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')  // Escape backslashes first (order matters)
    .replace(/,/g, '\\,')    // Escape commas
    .replace(/;/g, '\\;')    // Escape semicolons (used as vCard field separators)
    .replace(/\n/g, '\\n')   // Escape literal newlines
    .replace(/\r/g, '');     // Strip carriage returns (we add our own CRLF)
}
