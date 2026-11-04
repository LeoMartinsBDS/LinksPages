const $ = (selector, root = document) => root.querySelector(selector);

const supabaseConfig = window.SUPABASE_CONFIG || {};
const isSupabaseConfigured = Boolean(supabaseConfig.url?.startsWith("https://"))
  && Boolean(supabaseConfig.publishableKey)
  && !supabaseConfig.url.includes("COLE_AQUI")
  && !supabaseConfig.publishableKey.includes("COLE_AQUI");
const supabaseClient = isSupabaseConfigured && window.supabase
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.publishableKey)
  : null;

const THEMES = [
  { key: "claro", label: "Claro" },
  { key: "escuro", label: "Escuro" },
  { key: "oceano", label: "Oceano" },
  { key: "por-do-sol", label: "Pôr do sol" },
];

const DEFAULT_PLATFORM = { key: "site", label: "Site", icon: "🔗", color: "#5b3df5" };
const PLATFORMS = [
  { key: "instagram", label: "Instagram", icon: "📸", color: "#e1306c", hosts: ["instagram.com"] },
  { key: "youtube", label: "YouTube", icon: "▶️", color: "#ff0033", hosts: ["youtube.com", "youtu.be"] },
  { key: "tiktok", label: "TikTok", icon: "🎵", color: "#161823", hosts: ["tiktok.com"] },
  { key: "x", label: "X / Twitter", icon: "🐦", color: "#14171a", hosts: ["x.com", "twitter.com"] },
  { key: "linkedin", label: "LinkedIn", icon: "💼", color: "#0a66c2", hosts: ["linkedin.com"] },
  { key: "github", label: "GitHub", icon: "💻", color: "#24292f", hosts: ["github.com"] },
  { key: "whatsapp", label: "WhatsApp", icon: "💬", color: "#1fa855", hosts: ["wa.me", "whatsapp.com"] },
  { key: "facebook", label: "Facebook", icon: "👍", color: "#1877f2", hosts: ["facebook.com", "fb.com", "fb.me"] },
  { key: "spotify", label: "Spotify", icon: "🎧", color: "#1db954", hosts: ["spotify.com"] },
  { key: "twitch", label: "Twitch", icon: "🎮", color: "#9146ff", hosts: ["twitch.tv"] },
  { key: "discord", label: "Discord", icon: "🗨️", color: "#5865f2", hosts: ["discord.gg", "discord.com"] },
  { key: "telegram", label: "Telegram", icon: "✈️", color: "#229ed9", hosts: ["t.me", "telegram.org"] },
  { key: "pinterest", label: "Pinterest", icon: "📌", color: "#e60023", hosts: ["pinterest.com"] },
];

// Aceita "instagram.com/fulano" e devolve "https://instagram.com/fulano".
// Só permite http/https com um domínio; qualquer outra coisa (javascript:, data:, ftp:) vira null.
function normalizeUrl(raw) {
  let value = String(raw || "").trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return null;
    value = `https://${value}`;
  }
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname.includes(".")) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function isHttpsUrl(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function detectPlatform(url) {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return DEFAULT_PLATFORM; }
  return PLATFORMS.find((platform) => platform.hosts.some((h) => host === h || host.endsWith(`.${h}`))) || DEFAULT_PLATFORM;
}

const normalizeUsername = (value) => String(value || "").trim().replace(/^@/, "").toLowerCase();
const isValidUsername = (value) => /^[a-z0-9_]{3,30}$/.test(value);

function publicProfileUrl(username) {
  return new URL(`perfil.html?u=${encodeURIComponent(username)}`, window.location.href).href;
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return node;
}

// Registra o clique sem bloquear a navegação (keepalive sobrevive à troca de página).
function trackClick(linkId) {
  if (!isSupabaseConfigured) return;
  try {
    fetch(`${supabaseConfig.url}/rest/v1/rpc/register_click`, {
      method: "POST",
      keepalive: true,
      headers: { apikey: supabaseConfig.publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ link_id: linkId }),
    }).catch(() => {});
  } catch { /* contagem é opcional */ }
}

// Desenha a página pública de um perfil. Usada em perfil.html e na pré-visualização do painel.
function renderProfile(container, profile, links, { preview = false } = {}) {
  const name = profile.display_name || `@${profile.username}`;
  container.classList.add("profile-page");
  container.dataset.theme = THEMES.some((theme) => theme.key === profile.theme) ? profile.theme : "claro";

  const avatar = isHttpsUrl(profile.avatar_url)
    ? el("img", { class: "profile-avatar", src: profile.avatar_url, alt: "", referrerpolicy: "no-referrer" })
    : el("div", { class: "profile-avatar fallback", "aria-hidden": "true", text: (name.replace(/^@/, "")[0] || "?").toUpperCase() });

  const items = links.map((link) => {
    const safeUrl = normalizeUrl(link.url);
    const platform = detectPlatform(safeUrl || link.url);
    return el("li", {},
      el("a", {
        class: "link-button",
        href: safeUrl || "#",
        rel: "noopener noreferrer nofollow",
        onclick: (event) => {
          if (preview || !safeUrl) { event.preventDefault(); return; }
          trackClick(link.id);
        },
      },
      el("span", { class: "link-icon", style: `background:${platform.color}`, "aria-hidden": "true", text: platform.icon }),
      el("span", { class: "link-label", text: link.title }),
      el("span", { class: "link-arrow", "aria-hidden": "true", text: "›" })));
  });

  container.replaceChildren(
    avatar,
    el(preview ? "h2" : "h1", { class: "profile-name", text: name }),
    profile.display_name ? el("p", { class: "profile-handle", text: `@${profile.username}` }) : null,
    profile.bio ? el("p", { class: "profile-bio", text: profile.bio }) : null,
    items.length
      ? el("ul", { class: "link-list" }, ...items)
      : el("p", { class: "empty-links", text: "Nenhum link por aqui ainda." }),
    preview ? null : el("a", { class: "profile-footer", href: "index.html", text: "Crie o seu LinksPages" }),
  );
}
