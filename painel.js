const state = { user: null, profile: null, links: [], editingId: null, authMode: "login", recovering: false };
const SCREENS = ["configWarning", "authScreen", "recoveryScreen", "onboardScreen", "appShell"];
let toastTimer = null;

const showScreen = (name) => SCREENS.forEach((id) => { $(`#${id}`).hidden = id !== name; });
const pagePath = () => `${window.location.origin}${window.location.pathname}`;

function toast(message) {
  const box = $("#toast");
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 3200);
}

function setMessage(selector, text, kind = "error") {
  const node = $(selector);
  node.textContent = text;
  node.classList.toggle("success", kind === "success");
}

const AUTH_ERRORS = [
  ["invalid login credentials", "E-mail ou senha incorretos."],
  ["email not confirmed", "Confirme seu e-mail antes de entrar. Procure o link na sua caixa de entrada."],
  ["user already registered", "Já existe uma conta com esse e-mail. Tente entrar."],
  ["password should be at least", "A senha precisa ter no mínimo 6 caracteres."],
  ["rate limit", "Muitas tentativas. Aguarde um pouco e tente novamente."],
  ["different from the old password", "A nova senha precisa ser diferente da atual."],
];

function translateError(error) {
  const text = (error?.message || "").toLowerCase();
  const match = AUTH_ERRORS.find(([key]) => text.includes(key));
  if (!match) console.error(error);
  return match ? match[1] : "Algo deu errado. Tente novamente.";
}

/* ---------- Autenticação ---------- */

function renderAuthMode() {
  const login = state.authMode === "login";
  $("#authTitle").textContent = login ? "Entre na sua conta" : "Crie sua conta";
  $("#authDescription").textContent = login
    ? "Gerencie os links da sua página em qualquer aparelho."
    : "Cadastre-se com e-mail e senha para montar a sua página de links.";
  $("#authSubmit").textContent = login ? "Entrar" : "Criar conta";
  $("#authToggle").textContent = login ? "Ainda não tenho conta" : "Já tenho conta";
  $("#authPassword").autocomplete = login ? "current-password" : "new-password";
  $("#forgotPassword").hidden = !login;
  setMessage("#authMessage", "");
}

async function submitAuth(event) {
  event.preventDefault();
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  const button = $("#authSubmit");
  button.disabled = true;
  setMessage("#authMessage", "");

  try {
    if (state.authMode === "login") {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) setMessage("#authMessage", translateError(error));
      return;
    }
    const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: pagePath() } });
    if (error) { setMessage("#authMessage", translateError(error)); return; }
    // O Supabase devolve um usuário sem identidades quando o e-mail já existe.
    if (data.user && data.user.identities?.length === 0) {
      setMessage("#authMessage", "Já existe uma conta com esse e-mail. Tente entrar.");
      return;
    }
    if (!data.session) {
      setMessage("#authMessage", `Enviamos um link de confirmação para ${email}. Abra o e-mail e depois volte para entrar.`, "success");
    }
  } finally {
    button.disabled = false;
  }
}

async function sendPasswordReset() {
  const email = $("#authEmail").value.trim();
  if (!email) { setMessage("#authMessage", "Digite seu e-mail acima para receber o link de redefinição."); return; }
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: pagePath() });
  if (error) { setMessage("#authMessage", translateError(error)); return; }
  setMessage("#authMessage", "Se esse e-mail tiver uma conta, enviamos um link para redefinir a senha.", "success");
}

async function submitRecovery(event) {
  event.preventDefault();
  const { error } = await supabaseClient.auth.updateUser({ password: $("#newPassword").value });
  if (error) { setMessage("#recoveryMessage", translateError(error)); return; }
  state.recovering = false;
  history.replaceState(null, "", pagePath());
  toast("Senha atualizada.");
  const { data } = await supabaseClient.auth.getSession();
  await handleSession(data.session);
}

async function logout() {
  await supabaseClient.auth.signOut();
}

async function handleSession(session) {
  if (state.recovering) { showScreen("recoveryScreen"); return; }
  if (!session) {
    Object.assign(state, { user: null, profile: null, links: [], editingId: null });
    showScreen("authScreen");
    return;
  }
  // Renovações de token não precisam recarregar nada.
  if (state.user?.id === session.user.id && state.profile) { state.user = session.user; return; }
  await loadAccount(session.user);
}

async function loadAccount(user) {
  state.user = user;
  const { data: profile, error } = await supabaseClient.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (error) return failLoading(error);
  if (!profile) { state.profile = null; showScreen("onboardScreen"); return; }

  const { data: links, error: linksError } = await supabaseClient.from("links").select("*").eq("user_id", user.id).order("position");
  if (linksError) return failLoading(linksError);

  state.profile = profile;
  state.links = links || [];
  renderApp();
  showScreen("appShell");
}

function failLoading(error) {
  console.error(error);
  showScreen("authScreen");
  const missingTable = error.code === "42P01" || error.code === "PGRST205";
  setMessage("#authMessage", missingTable
    ? "As tabelas ainda não existem. Execute o supabase-schema.sql no SQL Editor do Supabase."
    : "Não foi possível carregar sua conta. Tente novamente.");
}

/* ---------- Escolha do endereço ---------- */

async function submitOnboard(event) {
  event.preventDefault();
  const username = normalizeUsername($("#onboardUsername").value);
  if (!isValidUsername(username)) {
    setMessage("#onboardMessage", "Use de 3 a 30 caracteres: letras minúsculas, números ou _.");
    return;
  }
  const { data, error } = await supabaseClient.from("profiles")
    .insert({ user_id: state.user.id, username, display_name: $("#onboardName").value.trim() })
    .select().single();
  if (error) {
    setMessage("#onboardMessage", error.code === "23505" ? "Esse endereço já está em uso. Escolha outro." : "Não foi possível criar sua página. Tente novamente.");
    return;
  }
  state.profile = data;
  state.links = [];
  renderApp();
  showScreen("appShell");
}

/* ---------- Painel ---------- */

function renderApp() {
  const { profile } = state;
  $("#userEmail").textContent = state.user.email;
  const url = publicProfileUrl(profile.username);
  $("#shareUrl").textContent = url;
  $("#shareUrl").href = url;
  $("#openShare").href = url;

  $("#profName").value = profile.display_name;
  $("#profBio").value = profile.bio;
  $("#profAvatar").value = profile.avatar_url;
  $("#bioCounter").textContent = `${profile.bio.length}/160`;
  renderThemePicker(profile.theme);
  renderLinks();
  renderPreview();
}

function renderThemePicker(selected) {
  $("#themePicker").replaceChildren(...THEMES.map((theme) => el("label", { class: "theme-option", "data-theme-preview": theme.key },
    el("input", { type: "radio", name: "theme", value: theme.key, checked: theme.key === selected }),
    el("span", { class: "theme-swatch", "aria-hidden": "true" }),
    el("span", { text: theme.label }))));
}

const draftProfile = () => ({
  ...state.profile,
  display_name: $("#profName").value.trim(),
  bio: $("#profBio").value.trim(),
  avatar_url: $("#profAvatar").value.trim(),
  theme: $("#themePicker input:checked")?.value || state.profile.theme,
});

function renderPreview() {
  renderProfile($("#preview"), draftProfile(), state.links.filter((link) => link.is_active), { preview: true });
}

function renderLinks() {
  const list = $("#linkList");
  $("#linksEmpty").hidden = state.links.length > 0;
  $("#linkCount").textContent = state.links.length ? `${state.links.length} ${state.links.length === 1 ? "link" : "links"}` : "";
  list.replaceChildren(...state.links.map((link, index) => (link.id === state.editingId ? editRow(link) : viewRow(link, index))));
  const titleInput = list.querySelector(".edit-form input");
  if (titleInput) titleInput.focus();
}

function viewRow(link, index) {
  const platform = detectPlatform(link.url);
  return el("li", { class: `manage-item${link.is_active ? "" : " inactive"}` },
    el("span", { class: "link-icon", style: `background:${platform.color}`, "aria-hidden": "true", text: platform.icon }),
    el("div", { class: "manage-info" },
      el("strong", { text: link.title }),
      el("small", { text: link.url })),
    el("span", { class: "click-badge", title: "Cliques registrados", text: `${link.clicks} ${link.clicks === 1 ? "clique" : "cliques"}` }),
    el("div", { class: "manage-actions" },
      el("button", { class: "mini-button", type: "button", "aria-label": "Mover para cima", disabled: index === 0, onclick: () => moveLink(link.id, -1), text: "▲" }),
      el("button", { class: "mini-button", type: "button", "aria-label": "Mover para baixo", disabled: index === state.links.length - 1, onclick: () => moveLink(link.id, 1), text: "▼" }),
      el("label", { class: "switch", title: link.is_active ? "Visível na página" : "Oculto da página" },
        el("input", { type: "checkbox", checked: link.is_active, "aria-label": "Link visível", onchange: (event) => saveLink(link.id, { is_active: event.target.checked }) }),
        el("span", { class: "switch-track" })),
      el("button", { class: "mini-button", type: "button", "aria-label": "Editar link", onclick: () => { state.editingId = link.id; renderLinks(); }, text: "✏️" }),
      el("button", { class: "mini-button danger", type: "button", "aria-label": "Excluir link", onclick: () => deleteLink(link.id), text: "🗑" })));
}

function editRow(link) {
  const titleInput = el("input", { type: "text", maxlength: 80, value: link.title, required: true, "aria-label": "Título do link" });
  const urlInput = el("input", { type: "text", inputmode: "url", autocapitalize: "none", value: link.url, required: true, "aria-label": "Endereço do link" });
  const message = el("p", { class: "form-message", "aria-live": "polite" });
  return el("li", { class: "manage-item editing" },
    el("form", {
      class: "edit-form",
      novalidate: true,
      onsubmit: async (event) => {
        event.preventDefault();
        const title = titleInput.value.trim();
        const url = normalizeUrl(urlInput.value);
        if (!title) { message.textContent = "Informe um título."; return; }
        if (!url) { message.textContent = "Informe um endereço válido (http ou https)."; return; }
        state.editingId = null;
        await saveLink(link.id, { title, url });
      },
    },
    titleInput, urlInput,
    el("div", { class: "edit-buttons" },
      el("button", { class: "primary-button", type: "submit", text: "Salvar" }),
      el("button", { class: "ghost-button", type: "button", onclick: () => { state.editingId = null; renderLinks(); }, text: "Cancelar" })),
    message));
}

async function addLink(event) {
  event.preventDefault();
  const title = $("#addTitle").value.trim();
  const url = normalizeUrl($("#addUrl").value);
  if (!title) { setMessage("#addMessage", "Informe um título para o link."); return; }
  if (!url) { setMessage("#addMessage", "Informe um endereço válido, como instagram.com/seuperfil."); return; }
  setMessage("#addMessage", "");

  const position = state.links.reduce((max, link) => Math.max(max, link.position), -1) + 1;
  const { data, error } = await supabaseClient.from("links")
    .insert({ user_id: state.user.id, title, url, position })
    .select().single();
  if (error) { console.error(error); setMessage("#addMessage", "Não foi possível adicionar o link. Tente novamente."); return; }

  state.links.push(data);
  $("#addForm").reset();
  $("#addTitle").focus();
  renderLinks();
  renderPreview();
}

async function saveLink(id, patch) {
  const { error } = await supabaseClient.from("links").update(patch).eq("id", id);
  if (error) { console.error(error); toast("Não foi possível salvar. Tente novamente."); await reloadLinks(); return; }
  state.links = state.links.map((link) => (link.id === id ? { ...link, ...patch } : link));
  renderLinks();
  renderPreview();
}

async function deleteLink(id) {
  const link = state.links.find((item) => item.id === id);
  if (!link || !window.confirm(`Excluir "${link.title}"?`)) return;
  const { error } = await supabaseClient.from("links").delete().eq("id", id);
  if (error) { console.error(error); toast("Não foi possível excluir. Tente novamente."); return; }
  state.links = state.links.filter((item) => item.id !== id);
  renderLinks();
  renderPreview();
}

async function moveLink(id, delta) {
  const from = state.links.findIndex((link) => link.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= state.links.length) return;

  const reordered = [...state.links];
  [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
  const changed = [];
  reordered.forEach((link, index) => {
    if (link.position !== index) changed.push(link);
    link.position = index;
  });
  state.links = reordered;
  renderLinks();
  renderPreview();

  const results = await Promise.all(changed.map((link) => supabaseClient.from("links").update({ position: link.position }).eq("id", link.id)));
  if (results.some((result) => result.error)) {
    toast("Não foi possível salvar a nova ordem.");
    await reloadLinks();
  }
}

async function reloadLinks() {
  const { data } = await supabaseClient.from("links").select("*").eq("user_id", state.user.id).order("position");
  if (data) { state.links = data; renderLinks(); renderPreview(); }
}

async function saveProfile(event) {
  event.preventDefault();
  const draft = draftProfile();
  if (draft.avatar_url && !isHttpsUrl(draft.avatar_url)) {
    setMessage("#profileMessage", "A foto precisa ser um endereço que comece com https://.");
    return;
  }
  setMessage("#profileMessage", "");
  const patch = { display_name: draft.display_name, bio: draft.bio, avatar_url: draft.avatar_url, theme: draft.theme };
  const { error } = await supabaseClient.from("profiles").update(patch).eq("user_id", state.user.id);
  if (error) { console.error(error); setMessage("#profileMessage", "Não foi possível salvar. Tente novamente."); return; }
  state.profile = { ...state.profile, ...patch };
  toast("Perfil salvo.");
}

async function copyShare() {
  const url = publicProfileUrl(state.profile.username);
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copiado.");
  } catch {
    window.prompt("Copie o link:", url);
  }
}

/* ---------- Inicialização ---------- */

function init() {
  if (!supabaseClient) { showScreen("configWarning"); return; }

  $("#authForm").addEventListener("submit", submitAuth);
  $("#authToggle").addEventListener("click", () => { state.authMode = state.authMode === "login" ? "signup" : "login"; renderAuthMode(); });
  $("#forgotPassword").addEventListener("click", sendPasswordReset);
  $("#recoveryForm").addEventListener("submit", submitRecovery);
  $("#onboardForm").addEventListener("submit", submitOnboard);
  $("#onboardLogout").addEventListener("click", logout);
  $("#logoutButton").addEventListener("click", logout);
  $("#addForm").addEventListener("submit", addLink);
  $("#profileForm").addEventListener("submit", saveProfile);
  $("#profileForm").addEventListener("input", () => {
    $("#bioCounter").textContent = `${$("#profBio").value.length}/160`;
    renderPreview();
  });
  $("#copyShare").addEventListener("click", copyShare);
  $("#onboardUsername").addEventListener("input", (event) => { event.target.value = normalizeUsername(event.target.value).replace(/[^a-z0-9_]/g, ""); });

  renderAuthMode();
  showScreen("authScreen");

  // Link de redefinição de senha: o evento PASSWORD_RECOVERY chega depois do SIGNED_IN.
  state.recovering = window.location.hash.includes("type=recovery");

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") state.recovering = true;
    // Chamadas ao Supabase dentro do callback podem travar; adia para o próximo ciclo.
    setTimeout(() => handleSession(session), 0);
  });
}

init();
