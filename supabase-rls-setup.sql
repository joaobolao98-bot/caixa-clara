-- ============================================================================
-- CAIXA CLARA — Row Level Security (RLS) no Supabase
-- ============================================================================
-- POR QUE ISTO É NECESSÁRIO:
-- O front-end (index.html) usa a chave "anon" do Supabase, que é PÚBLICA
-- (qualquer pessoa que abrir o site consegue vê-la no código-fonte). Isso é
-- normal e esperado — a segurança de verdade não vem de esconder essa chave,
-- e sim de configurar o RLS corretamente em cada tabela.
--
-- Sem RLS ativado, qualquer usuário logado (ou até visitante anônimo, se as
-- políticas de "anon" permitirem) pode usar a própria chave pública do seu
-- site para consultar a API do Supabase diretamente e ler ou alterar os
-- dados de QUALQUER cliente seu — não só os dele.
--
-- COMO USAR ESTE ARQUIVO:
-- 1. Abra o painel do Supabase → SQL Editor.
-- 2. Confira se os nomes de tabela/coluna abaixo batem com o seu banco real
--    (ajuste se for diferente).
-- 3. Rode este script inteiro.
-- 4. Depois, vá em Authentication → Policies e confirme visualmente que cada
--    tabela aparece com RLS "Enabled" e as políticas listadas abaixo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tabela: usuarios (id = auth.uid() do próprio usuário)
-- ---------------------------------------------------------------------------
alter table public.usuarios enable row level security;

drop policy if exists "usuarios_select_own" on public.usuarios;
create policy "usuarios_select_own"
  on public.usuarios for select
  using (auth.uid() = id);

drop policy if exists "usuarios_update_own" on public.usuarios;
create policy "usuarios_update_own"
  on public.usuarios for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Não criamos política de INSERT/DELETE de propósito: a criação de linha em
-- "usuarios" deve acontecer só via trigger de auth.users ou via backend com
-- a service role key — nunca diretamente pelo cliente.

-- ---------------------------------------------------------------------------
-- Tabela: assinaturas (user_id referencia auth.uid())
-- ---------------------------------------------------------------------------
alter table public.assinaturas enable row level security;

drop policy if exists "assinaturas_select_own" on public.assinaturas;
create policy "assinaturas_select_own"
  on public.assinaturas for select
  using (auth.uid() = user_id);

-- Sem políticas de insert/update/delete para o cliente: só os webhooks
-- (que usam a SERVICE ROLE KEY, e por isso ignoram o RLS) devem escrever
-- nessa tabela. Isso impede que alguém se auto-promova a "assinante ativo".

-- ---------------------------------------------------------------------------
-- Tabela: estoque
-- ---------------------------------------------------------------------------
alter table public.estoque enable row level security;

drop policy if exists "estoque_all_own" on public.estoque;
create policy "estoque_all_own"
  on public.estoque for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Tabela: clientes
-- ---------------------------------------------------------------------------
alter table public.clientes enable row level security;

drop policy if exists "clientes_all_own" on public.clientes;
create policy "clientes_all_own"
  on public.clientes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Tabela: agendamentos
-- ---------------------------------------------------------------------------
alter table public.agendamentos enable row level security;

drop policy if exists "agendamentos_all_own" on public.agendamentos;
create policy "agendamentos_all_own"
  on public.agendamentos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Tabela: lancamentos
-- ---------------------------------------------------------------------------
alter table public.lancamentos enable row level security;

drop policy if exists "lancamentos_all_own" on public.lancamentos;
create policy "lancamentos_all_own"
  on public.lancamentos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- CHECKLIST FINAL (depois de rodar o script):
-- [ ] Cada tabela acima aparece com RLS "Enabled" em Authentication > Policies
-- [ ] Testou logado como Usuário A que NÃO consegue ver dados do Usuário B
--     (troque de conta no site e confirme que a lista de clientes/estoque
--     muda e nunca mostra dados de outra conta)
-- [ ] Testou que um usuário sem assinatura ativa não consegue, via SQL
--     direto no navegador (devtools), forçar status_plano = 'ativo' nele
--     mesmo (isso é bloqueado pela ausência de política de UPDATE em
--     "assinaturas" para o cliente comum)
-- ============================================================================
