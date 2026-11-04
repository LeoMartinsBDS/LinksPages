(async function loadPublicProfile() {
  const container = $("#profile");

  const showMessage = (title, text) => {
    container.classList.add("profile-page");
    container.replaceChildren(
      el("h1", { class: "profile-name", text: title }),
      el("p", { class: "profile-bio", text }),
      el("a", { class: "profile-footer", href: "index.html", text: "Criar o meu LinksPages" }),
    );
  };

  const username = normalizeUsername(new URLSearchParams(window.location.search).get("u") || window.location.hash.slice(1));
  if (!isValidUsername(username)) {
    showMessage("Página não encontrada", "O endereço informado não é válido.");
    return;
  }
  if (!supabaseClient) {
    showMessage("Site não configurado", "Preencha o arquivo supabase-config.js com os dados do seu projeto Supabase.");
    return;
  }

  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("user_id, username, display_name, bio, avatar_url, theme")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    showMessage("Não foi possível carregar", "Tente novamente em alguns instantes.");
    return;
  }
  if (!profile) {
    showMessage("Página não encontrada", `Ninguém usa o endereço @${username} ainda.`);
    return;
  }

  const { data: links, error: linksError } = await supabaseClient
    .from("links")
    .select("id, title, url, position")
    .eq("user_id", profile.user_id)
    .eq("is_active", true)
    .order("position");

  if (linksError) {
    showMessage("Não foi possível carregar", "Tente novamente em alguns instantes.");
    return;
  }

  document.title = `${profile.display_name || `@${profile.username}`} | LinksPages`;
  renderProfile(container, profile, links || []);
})();
