O que verifiquei de fato
Verificação	Resultado
tsc --noEmit backend e frontend	limpo
next build (produção)	4 rotas, todas dinâmicas (ƒ)
eslint .	limpo
Validador de CPF em TS	9 casos, incluindo 529.982.247-25 → true e 111.111.111-11 → false
PDF com 0 / 23 / 40 participantes	1 / 2 / 3 páginas; cabeçalho repetido, "Página X de Y", coluna de assinatura vazia
Datas no PDF	event_date 2026-07-23 → 23/07/2026 (sem o bug de UTC−3)
/health, 401 sem token, 401 com token inválido, 404	todos corretos
Três bugs reais que apareceram na verificação
PDF saía com 6 páginas em vez de 2. Os rodapés ficam abaixo da margem inferior, e o PDFKit acrescenta uma página a cada escrita de texto ali. Corrigi zerando page.margins.bottom durante o rodapé (attendanceReport.ts).
(11) 98765-4321 quebrava em duas linhas. Medi: 66,5pt num espaço de 65pt. Reduzi o padding e o corpo das colunas numéricas para 8,5pt.
Nomes longos eram cortados. "Maria Aparecida da Conceição Nascimento Silva Rodrigues" não cabe em 170pt a 10pt — e truncar nome numa lista de presença invalida o documento. Adicionei ajuste automático de corpo (10pt → 6pt) em vez de corte.
Duas decisões que tomei
Next 15, não 16. O create-next-app instalou o 16; o plano especifica o 15 e o middleware.ts dele é o padrão do @supabase/ssr para o 15. Fixei o 15 e removi os arquivos do scaffold que documentavam convenções do 16 (AGENTS.md/CLAUDE.md), além do .git que o scaffold criou dentro de frontend/ — ele viraria um gitlink e quebraria o import na Vercel com Root Directory = frontend.
O snippet do middleware do plano não compila com strict. createServerClient é sobrecarregado, então os parâmetros de setAll caíam em any implícito. Anotei com Parameters<SetAllCookies>[0], preservando a desestruturação de options que o plano destaca.
Também adicionei exposedHeaders: ['Content-Disposition'] no CORS — sem isso o browser não lê o nome do arquivo em cross-origin, e o download sairia com nome genérico em produção.

O que falta e não pude verificar
A imagem Docker não foi construída. O Docker Desktop não está com o daemon rodando (npipe:////./pipe/dockerDesktopLinuxEngine não existe). Um docker build meu chegou a reportar sucesso, mas era o exit code do tail mascarando a falha do pipe — refiz a checagem e confirmei que não construiu. Suba o Docker Desktop e rode docker compose up --build.
Nada foi testado contra um Supabase real — não há projeto nem credenciais. Os passos 7–15 e 21–23 da seção Verificação do plano (fluxo completo, RLS, fuso com registro noturno) dependem disso.
Próximo passo: criar o projeto no Supabase, rodar o schema.sql, criar o admin e desabilitar o signup público — sem isso qualquer pessoa cria conta e vira admin.