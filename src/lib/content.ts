export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const TITLE_SUFFIX = ' | Travel Germany';

// Keeps <title> under ~60 characters: the brand suffix is only added when it fits.
export function pageTitle(title: string, seoTitle?: string): string {
  const base = seoTitle || title;
  return base.length + TITLE_SUFFIX.length <= 60 ? `${base}${TITLE_SUFFIX}` : base;
}

export function excerptFromContent(html: string, max = 150): string {
  const text = stripHtml(html);
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}...`;
}

export function firstImageFromContent(html: string): string {
  const match = html.match(/<img[^>]*src=["']([^"']+)["']/i);
  return match?.[1] ?? '';
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}
