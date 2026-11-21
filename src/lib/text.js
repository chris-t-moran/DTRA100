import sanitizeHtml from 'sanitize-html';

// Story text may contain light formatting HTML written by the editor. Keep that, strip anything else.
export function storyHtml(description) {
  const html = String(description || '').replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
  return sanitizeHtml(html, {
    allowedTags: ['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'center', 'blockquote', 'ul', 'ol', 'li',
                  'a', 'img', 'iframe', 'h3', 'h4', 'span', 'div'],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'loading'],
      iframe: ['src', 'title', 'width', 'height', 'allow', 'allowfullscreen', 'loading'],
      div: ['class', 'data-img'],
      span: ['class']
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com'],
    // Drop images that don't point at a real web address (e.g. broken or injected ones)
    exclusiveFilter: (frame) => frame.tag === 'img' && !/^https?:\/\//i.test(frame.attribs.src || ''),
    // Old stories embed YouTube with <embed>; turn those into a proper iframe
    transformTags: {
      embed: (tagName, attribs) => ({
        tagName: 'iframe',
        attribs: { src: attribs.src || '', title: attribs.title || 'Video', allowfullscreen: '', loading: 'lazy' }
      }),
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener' })
    }
  });
}

// Plain text for page descriptions and previews
export function plainText(html, max = 180) {
  const t = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : t;
}

export function readingMinutes(html) {
  const words = String(html || '').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
