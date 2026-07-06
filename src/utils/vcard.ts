
import { PublicProfile } from '../types';

export function generateVCard(profile: PublicProfile): string {
  const CRLF = '\r\n';

  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
  ];

  lines.push(`FN:${escapeVCardValue(profile.fullName)}`);

  const nameParts = profile.fullName.split(' ');
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
  const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : nameParts[0];
  lines.push(`N:${escapeVCardValue(lastName)};${escapeVCardValue(firstName)};;;`);

  if (profile.jobTitle) {
    lines.push(`TITLE:${escapeVCardValue(profile.jobTitle)}`);
  }
  if (profile.company) {
    lines.push(`ORG:${escapeVCardValue(profile.company)}`);
  }

  if (profile.phone) {
    lines.push(`TEL;TYPE=CELL:${profile.phone}`);
  }
  if (profile.email) {
    lines.push(`EMAIL;TYPE=WORK:${profile.email}`);
  }
  if (profile.website) {
    lines.push(`URL:${profile.website}`);
  }

  if (profile.bio) {
    lines.push(`NOTE:${escapeVCardValue(profile.bio)}`);
  }

  if (profile.whatsapp) {
    lines.push(`X-SOCIALPROFILE;type=whatsapp:https://wa.me/${profile.whatsapp}`);
  }

  for (const link of profile.links) {
    const type = link.type.toUpperCase();
    lines.push(`X-SOCIALPROFILE;type=${type}:${link.url}`);
  }

  lines.push('END:VCARD');

  return lines.join(CRLF);
}

function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}
