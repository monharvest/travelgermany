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
