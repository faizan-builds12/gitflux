/**
 * Hide secrets before anything reaches the page or the saved history.
 * Agents often put tokens in remote URLs (https://user:ghp_xxx@github.com/...),
 * and prompts or command output can contain pasted keys.
 */
const PATTERNS: RegExp[] = [
  /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,  // GitHub tokens
  /\bglpat-[A-Za-z0-9_-]{20,}/g,                                  // GitLab
  /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{16,}/g,                   // Stripe
  /\bsk-(ant-|proj-)?[A-Za-z0-9_-]{20,}/g,                        // Anthropic, OpenAI
  /\bAKIA[0-9A-Z]{16}\b/g,                                        // AWS access key id
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,                              // Slack
  /\bAIza[0-9A-Za-z_-]{35}\b/g,                                   // Google API key
  /\b(Bearer|token)\s+[A-Za-z0-9._~+/-]{20,}=*/gi                 // auth headers
];

export function redact(text: string): string;
export function redact(text: string | undefined): string | undefined;
export function redact(text: string | undefined) {
  if (!text) return text;
  // user:password@ or token@ in any URL
  let s = text.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(:[^\s/@]*)?@/gi, '$1***@');
  for (const re of PATTERNS) s = s.replace(re, m => (/^(Bearer|token)\s/i.test(m) ? `${m.split(/\s+/)[0]} ***` : '***'));
  return s;
}
