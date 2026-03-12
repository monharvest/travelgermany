import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SQL_PATH = path.resolve(ROOT, '../wpclone_backup/database.sql');
const POSTS_DIR = path.resolve(ROOT, 'src/content/posts');
const PAGES_DIR = path.resolve(ROOT, 'src/content/pages');
const DATA_DIR = path.resolve(ROOT, 'src/data');

function decodeSqlString(raw) {
  if (raw === 'NULL') return '';
  let value = raw;
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }

  return value
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}

function parseInsertValues(valueString) {
  const values = [];
  let current = '';
  let inQuote = false;
  let escaped = false;

  for (let i = 0; i < valueString.length; i += 1) {
    const char = valueString[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      inQuote = !inQuote;
      current += char;
      continue;
    }

    if (char === ',' && !inQuote) {
      values.push(decodeSqlString(current.trim()));
      current = '';
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    values.push(decodeSqlString(current.trim()));
  }

  return values;
}

function escapeYaml(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .trim();
}

function stripWordPressMarkers(html) {
  return html
    .replace(/<!--\s*wp:[\s\S]*?-->/g, '')
    .replace(/<!--\s*\/wp:[\s\S]*?-->/g, '')
    .replace(/\[sureforms[^\]]*\]/g, '')
    .replace(/\{[0-9a-f]{64}\}/g, '')
    .replace(/https?:\/\/travelgermany\.info\/wp-content\/uploads\//g, '/wp-content/uploads/')
    .replace(/^[\t ]+(?=<)/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function textPreview(html, maxLength = 180) {
  const plain = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trim()}...`;
}

async function emptyDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
  const entries = await fs.readdir(dirPath);
  await Promise.all(entries.map((entry) => fs.rm(path.join(dirPath, entry), { recursive: true, force: true })));
}

async function main() {
  const sql = await fs.readFile(SQL_PATH, 'utf8');
  const lines = sql.split('\n');

  const options = new Map();
  const posts = [];
  const postmeta = [];
  const terms = new Map();
  const termTaxonomy = new Map();
  const termRelations = [];

  for (const line of lines) {
    if (line.startsWith('INSERT INTO wp_options VALUES(')) {
      const values = parseInsertValues(line.slice('INSERT INTO wp_options VALUES('.length, -2));
      options.set(values[1], values[2]);
      continue;
    }

    if (line.startsWith('INSERT INTO wp_posts VALUES(')) {
      const values = parseInsertValues(line.slice('INSERT INTO wp_posts VALUES('.length, -2));
      posts.push(values);
      continue;
    }

    if (line.startsWith('INSERT INTO wp_postmeta VALUES(')) {
      const values = parseInsertValues(line.slice('INSERT INTO wp_postmeta VALUES('.length, -2));
      postmeta.push(values);
      continue;
    }

    if (line.startsWith('INSERT INTO wp_terms VALUES(')) {
      const values = parseInsertValues(line.slice('INSERT INTO wp_terms VALUES('.length, -2));
      terms.set(values[0], { name: values[1], slug: values[2] });
      continue;
    }

    if (line.startsWith('INSERT INTO wp_term_taxonomy VALUES(')) {
      const values = parseInsertValues(line.slice('INSERT INTO wp_term_taxonomy VALUES('.length, -2));
      termTaxonomy.set(values[0], { termId: values[1], taxonomy: values[2] });
      continue;
    }

    if (line.startsWith('INSERT INTO wp_term_relationships VALUES(')) {
      const values = parseInsertValues(line.slice('INSERT INTO wp_term_relationships VALUES('.length, -2));
      termRelations.push({ objectId: values[0], taxonomyId: values[1] });
    }
  }

  const attachmentsById = new Map();
  for (const row of posts) {
    const id = row[0];
    const type = row[20];
    const guid = row[18];
    if (type === 'attachment' && guid) {
      attachmentsById.set(
        id,
        guid.replace(/https?:\/\/travelgermany\.info\/wp-content\/uploads\//g, '/wp-content/uploads/')
      );
    }
  }

  const thumbnailByPostId = new Map();
  for (const row of postmeta) {
    const postId = row[1];
    const key = row[2];
    const value = row[3];
    if (key === '_thumbnail_id') {
      thumbnailByPostId.set(postId, value);
    }
  }

  const taxonomyByPostId = new Map();
  for (const relation of termRelations) {
    const taxonomyRef = termTaxonomy.get(relation.taxonomyId);
    if (!taxonomyRef) continue;
    const term = terms.get(taxonomyRef.termId);
    if (!term) continue;

    const current = taxonomyByPostId.get(relation.objectId) ?? { category: [], post_tag: [] };
    if (taxonomyRef.taxonomy === 'category' || taxonomyRef.taxonomy === 'post_tag') {
      current[taxonomyRef.taxonomy].push(term.name);
      taxonomyByPostId.set(relation.objectId, current);
    }
  }

  const publishedContent = posts
    .filter((row) => row[7] === 'publish' && (row[20] === 'post' || row[20] === 'page'))
    .map((row) => {
      const id = row[0];
      const slug = row[11] || `post-${id}`;
      const taxonomy = taxonomyByPostId.get(id) ?? { category: [], post_tag: [] };
      const thumbId = thumbnailByPostId.get(id);
      const featuredImage = thumbId ? attachmentsById.get(thumbId) ?? '' : '';

      return {
        id,
        title: row[5] || slug,
        slug,
        excerpt: row[6] || textPreview(stripWordPressMarkers(row[4] || '')),
        content: stripWordPressMarkers(row[4] || ''),
        date: row[2],
        type: row[20],
        categories: [...new Set(taxonomy.category)],
        tags: [...new Set(taxonomy.post_tag)],
        featuredImage,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  await emptyDir(POSTS_DIR);
  await emptyDir(PAGES_DIR);

  for (const item of publishedContent) {
    const frontmatter = [
      '---',
      `id: "${escapeYaml(item.id)}"`,
      `title: "${escapeYaml(item.title)}"`,
      `slug: "${escapeYaml(item.slug)}"`,
      `date: "${escapeYaml(item.date)}"`,
      `excerpt: "${escapeYaml(item.excerpt)}"`,
      `featuredImage: "${escapeYaml(item.featuredImage)}"`,
      `categories: [${item.categories.map((name) => `"${escapeYaml(name)}"`).join(', ')}]`,
      `tags: [${item.tags.map((name) => `"${escapeYaml(name)}"`).join(', ')}]`,
      '---',
      '',
      item.content || '<p>No content available.</p>',
      '',
    ].join('\n');

    const fileName = `${item.slug || item.id}.md`;
    const targetDir = item.type === 'post' ? POSTS_DIR : PAGES_DIR;
    await fs.writeFile(path.join(targetDir, fileName), frontmatter, 'utf8');
  }

  const siteData = {
    title: options.get('blogname') || 'Travel Germany',
    description: options.get('blogdescription') || 'Explore Germany beyond the obvious.',
    siteUrl: options.get('home') || 'https://travelgermany.info',
    importedAt: new Date().toISOString(),
    counts: {
      posts: publishedContent.filter((item) => item.type === 'post').length,
      pages: publishedContent.filter((item) => item.type === 'page').length,
    },
  };

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, 'site.json'), `${JSON.stringify(siteData, null, 2)}\n`, 'utf8');

  console.log(`Imported ${siteData.counts.posts} posts and ${siteData.counts.pages} pages.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
