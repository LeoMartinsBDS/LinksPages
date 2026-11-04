# LinksPages

Uma página de links no estilo Linktree. Cada pessoa cria uma conta com e-mail e senha, cadastra os links das suas redes sociais e compartilha **um único endereço**. Quem abrir esse endereço vê os botões e é redirecionado para a rede escolhida.

Aplicação estática (HTML, CSS e JavaScript puro) com Supabase para login e banco de dados, publicada no GitHub Pages.

## Páginas

- **[index.html](index.html)** — página inicial, pública: apresenta o produto e permite abrir a página de alguém pelo `@endereço`.
- **[painel.html](painel.html)** — painel com login. Cadastro/entrada, escolha do `@endereço`, gerenciamento dos links (adicionar, editar, ordenar, ocultar, excluir, ver cliques), perfil e tema, com pré-visualização ao vivo.
- **[perfil.html](perfil.html)** — a página pública de cada pessoa, acessada como `perfil.html?u=seuendereco`. Não exige login.

## O que o app faz

- Cadastro e login com e-mail e senha, com confirmação por e-mail e recuperação de senha.
- Cada conta tem um `@endereço` único (3 a 30 caracteres: letras minúsculas, números e `_`).
- Links com título e endereço. O ícone/cor é detectado automaticamente (Instagram, YouTube, TikTok, X, LinkedIn, GitHub, WhatsApp, Facebook, Spotify, Twitch, Discord, Telegram, Pinterest); outros viram "Site".
- Ordenar (▲▼), ocultar sem apagar (interruptor), editar e excluir.
- Contador de cliques por link.
- Perfil com nome, bio, foto (endereço `https` de uma imagem) e 4 temas: Claro, Escuro, Oceano e Pôr do sol.

## 1. Criar e configurar o Supabase

1. Em [Supabase](https://supabase.com), clique em **New project**. O ideal é um projeto novo para o LinksPages, para não misturar as contas com as de outros apps. (Usar o mesmo projeto do Society também funciona: as tabelas têm nomes diferentes, mas as contas de e-mail passam a ser compartilhadas.)
2. Quando o projeto estiver pronto, abra **SQL Editor** > **New query**.
3. Copie todo o conteúdo de [supabase-schema.sql](supabase-schema.sql), cole no editor e clique em **Run**. Isso cria as tabelas `profiles` e `links` e as regras de segurança: qualquer pessoa pode **ler** perfis e links ativos, mas só o dono da conta consegue criar, alterar ou apagar os seus.
4. Abra **Project Settings** > **API**. Copie a **Project URL** e a chave **Publishable** (ou a chave `anon`, caso esse seja o nome exibido).
5. Abra [supabase-config.js](supabase-config.js) e preencha `url` e `publishableKey`. Essa chave é pública e pode ficar no GitHub; **nunca** use ou publique a chave `service_role`.
6. Em **Authentication** > **URL Configuration**, defina a **Site URL** com o endereço final do GitHub Pages (por exemplo `https://SEU-USUARIO.github.io/LinksPages/`) e adicione `https://SEU-USUARIO.github.io/LinksPages/**` em **Redirect URLs**. Os links de confirmação de e-mail e de redefinição de senha dependem disso.
7. Em **Authentication** > **Providers** > **Email**, mantenha o provedor de e-mail ativo. A confirmação por e-mail é recomendada.

## 2. Publicar no GitHub Pages

1. No GitHub, crie um repositório público chamado `LinksPages`.
2. Envie todos os arquivos desta pasta para a branch `main`, incluindo a pasta `.github` e o arquivo `.nojekyll`:

   ```bash
   git init
   git branch -M main
   git add .
   git commit -m "LinksPages"
   git remote add origin https://github.com/SEU-USUARIO/LinksPages.git
   git push -u origin main
   ```

3. No repositório, acesse **Settings** > **Pages** e, em **Build and deployment**, selecione **GitHub Actions** como fonte.
4. O arquivo `.github/workflows/deploy.yml` já está pronto: ao enviar para `main`, ele publica o site. Acompanhe na aba **Actions** até o fluxo "Publicar no GitHub Pages" terminar.
5. Em **Settings** > **Pages**, clique em **Visit site**. O endereço será `https://SEU-USUARIO.github.io/LinksPages/`. Confira se ele bate com o que foi cadastrado no passo 6 do Supabase.

## Como usar

1. Abra `painel.html`, clique em **Ainda não tenho conta** e cadastre e-mail e senha.
2. Confirme o e-mail pelo link recebido e entre.
3. Escolha o seu `@endereço`.
4. Adicione os links (pode digitar `instagram.com/seuperfil`, o `https://` é completado sozinho).
5. Copie o **link público** no topo do painel e compartilhe.

## Desenvolvimento local

Preencha `supabase-config.js` e sirva a pasta com qualquer servidor estático, por exemplo:

```bash
python -m http.server 5500
```

Abra `http://localhost:5500/`. Para testar os e-mails de confirmação localmente, adicione `http://localhost:5500/**` nas **Redirect URLs** do Supabase.

## Observações de segurança

- Só são aceitos links `http://` e `https://`. A validação existe no navegador e também no banco (constraint em `links.url`), então não há como cadastrar `javascript:` e similares.
- Os conteúdos exibidos são sempre inseridos como texto (nunca como HTML), e links externos usam `rel="noopener noreferrer nofollow"`.
- O contador de cliques passa por uma função (`register_click`) porque visitantes não têm permissão de escrita nas tabelas. Como a página é pública, o contador pode ser inflado por quem quiser; trate-o como uma estimativa.
- O e-mail das contas nunca é exposto: a tabela pública `profiles` não o guarda.
