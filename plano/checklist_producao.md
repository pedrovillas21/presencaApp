# Checklist de Produção — o que resolver antes do deploy

Levantamento feito em 30/07/2026, com a stack rodando localmente (MySQL + API PHP).
A aplicação guarda **CPF, e-mail, telefone e assinatura** de participantes reais —
209 registros já importados. Cada item abaixo diz o que vaza se for ignorado.

Ordem de leitura: os **bloqueadores** impedem o deploy. Os demais podem entrar
logo depois, mas não muito depois.

---

## 🔴 Bloqueadores

### 1. Admin padrão com senha pública e versionada

`mysql/schema.sql` semeia `admin@exemplo.com` com a senha `admin`, e o hash
bcrypt está escrito no arquivo, dentro do repositório.

**O que vaza:** qualquer pessoa com acesso ao código — hoje ou no futuro, incluindo
quem só clonou o repo uma vez — entra no painel de produção e lê a lista completa
de CPFs. O comentário "trocar após o primeiro acesso" depende de alguém lembrar,
e o hash continua válido até que alguém troque.

**Como resolver:**
- Remover o `INSERT INTO admins` do `schema.sql`.
- Criar o primeiro admin por um comando à parte, com senha gerada na hora:
  ```bash
  docker compose exec backend php -r "echo password_hash('SENHA_FORTE_AQUI', PASSWORD_BCRYPT), PHP_EOL;"
  ```
  e inserir o hash resultante manualmente, uma vez.
- Conferir que o hash de teste não sobreviveu:
  ```sql
  SELECT email FROM admins;
  ```

> Enquanto o seed existir, considere a senha do painel de produção como pública.

### 2. Segredos em texto puro no `docker-compose.yml` versionado

O arquivo está rastreado no git e contém:

| Variável | Valor atual |
| :--- | :--- |
| `MYSQL_ROOT_PASSWORD` | `root_secret_password` |
| `MYSQL_PASSWORD` | `presenca_password` |
| `JWT_SECRET` | `presenca_app_jwt_super_secret_key_2026_change_in_prod` |

**O que vaza:** o `JWT_SECRET` é o pior dos três. Com ele, qualquer pessoa **forja
um token de admin válido** sem precisar de senha nenhuma — é só assinar um JWT com
`role: admin`. Não há como revogar sem trocar o segredo. As senhas do MySQL abrem o
banco inteiro para quem alcançar a porta.

**Como resolver:**
- Trocar os três valores por referências a variáveis de ambiente:
  ```yaml
  MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:?defina no .env}
  MYSQL_PASSWORD: ${MYSQL_PASSWORD:?defina no .env}
  JWT_SECRET: ${JWT_SECRET:?defina no .env}
  ```
  A sintaxe `:?` faz o compose **falhar** se a variável não existir, em vez de
  subir com string vazia.
- Colocar os valores reais num `.env` na raiz. O `.gitignore` já cobre `.env`
  (só `.env.example` é versionado) — confirme antes de commitar.
- Gerar um `JWT_SECRET` de verdade:
  ```bash
  openssl rand -base64 48
  ```
- **Os valores atuais já estão no histórico do git.** Trocá-los no arquivo não os
  apaga do passado. Se o repositório for público ou tiver muitos colaboradores,
  trate os três como comprometidos e gere valores novos — não reaproveite.

### 3. Cookie de sessão sem flag `Secure` e sem HTTPS

`Application::setAuthCookie()` ([Application.php:704](../backend/src/Application.php#L704))
define `httponly` e `samesite=Lax`, mas **não** define `secure`.

**O que vaza:** sem `secure`, o navegador manda o token de admin também em conexões
HTTP simples. Numa rede compartilhada (Wi-Fi de evento, por exemplo — que é
exatamente o cenário de uso desta aplicação), o token trafega em claro e pode ser
capturado.

**Como resolver:**
- Servir tudo sob HTTPS. Sem isso, os outros itens perdem sentido.
- Adicionar `'secure' => true` nas duas chamadas de `setcookie` (login e logout).
- Considerar `samesite=Strict` para o cookie de admin.

### 4. CORS apontando para `localhost`

`backend/.env` traz `ALLOWED_ORIGINS=http://localhost:3000`.

**O que quebra:** em produção o frontend estará em outro domínio, e toda chamada
do navegador será recusada com 403 ("Origem não permitida") — a aplicação
simplesmente não funciona.

**Como resolver:** definir `ALLOWED_ORIGINS` com o domínio real, via variável de
ambiente. Aceita lista separada por vírgula. **Não** usar `*`: o
`Application::applyCors()` responde com `Access-Control-Allow-Credentials: true`,
e a combinação de credenciais com origem coringa é justamente o que permite a um
site qualquer fazer requisições autenticadas em nome do usuário logado.

---

## 🟠 Importantes

### 5. Login sem limite de tentativas

Não há rate limiting em `POST /api/auth/login`. Com um único admin cadastrado, o
e-mail é conhecido e sobra adivinhar a senha — sem nenhum freio, e sem registro de
quem tentou.

**Como resolver:** limitar tentativas por IP e por e-mail (por exemplo, 5 em 15
minutos), com espera crescente. Registrar as falhas em log. Se a infraestrutura
tiver um proxy reverso na frente (nginx, Traefik, Cloudflare), dá para resolver lá
sem tocar no PHP.

### 6. Token de admin legível por JavaScript

Detalhado em [migracao_frontend.md, §2](migracao_frontend.md). Hoje o cookie que
efetivamente funciona é gravado por JS em `lib/api.ts` e **não** é HttpOnly — o
cookie HttpOnly que o PHP emite nasce no domínio da API e nunca chega ao frontend.

**O que vaza:** qualquer XSS no painel rouba a sessão de admin.

**Como resolver:** servir API e frontend sob o mesmo domínio (proxy reverso:
`/api/*` → PHP, resto → Next). Aí o cookie HttpOnly passa a valer,
`credentials: 'include'` substitui o header `Authorization`, e o `localStorage`
some. Resolve junto com o item 3.

### 7. `APP_ENV: dev` no build de produção

O `docker-compose.yml` passa `APP_ENV: dev` como build arg e variável, o que faz o
Dockerfile instalar dependências de desenvolvimento e copiar `tests/` para a imagem.

**Como resolver:** usar `APP_ENV: prod` no deploy (o Dockerfile já trata os dois
casos e ativa `--no-dev` e `--classmap-authoritative`). Vale um
`docker-compose.prod.yml` sobrepondo o de desenvolvimento.

### 8. Sem estratégia de backup

Os dados vivem no volume `mysql_data`. Um `docker compose down -v` — um caractere
de diferença do `down` normal — apaga tudo, sem confirmação e sem volta.

**Como resolver:** `mysqldump` periódico para fora do host, cifrado (o dump contém
os CPFs em claro). Testar a restauração pelo menos uma vez — backup não verificado
não é backup.

---

## 🟡 Dados pessoais

A base tem 209 CPFs, e-mails, telefones e assinaturas de pessoas reais. Alguns
pontos que valem decisão explícita antes de subir:

- **Retenção.** Não há política nem rotina de expurgo. Definir por quanto tempo a
  lista de um evento encerrado precisa existir, e o que acontece depois.
- **Quem acessa.** Hoje qualquer admin lê todos os CPFs de todos os eventos, e não
  há registro de quem consultou ou exportou o quê. Um log de acesso ao relatório
  em PDF seria o mínimo.
- **Os arquivos de migração.** Os CSVs em `~/Downloads` (`events_rows.csv`,
  `attendees_rows.csv`) e o `import_dados.sql` gerado contêm a base inteira em
  texto puro. Não commitar, e apagar quando a migração estiver concluída.
- **Assinaturas.** `signature_data` guarda a assinatura desenhada de cada
  participante. É dado biométrico comportamental e merece o mesmo cuidado do CPF —
  hoje ele sai no PDF do relatório sem controle adicional.
- **Backups.** Qualquer dump herda tudo isso. Cifrar e controlar quem tem acesso.

---

## ✅ Já resolvido

Registrado para não ser refeito nem revertido por engano:

| Item | Como está |
| :--- | :--- |
| **phpMyAdmin exposto** | Atrás do profile `tools` — o `docker compose up -d` do deploy o ignora. Só sobe com `--profile tools`, e preso ao `127.0.0.1:8081` |
| **MySQL exposto na rede** | Preso a `127.0.0.1:3307`. Em produção, remover o bloco `ports` do serviço `db` por completo e acessar por túnel SSH |
| **Header `Authorization` descartado** | O Apache o filtrava antes do PHP e toda rota autenticada devolvia 401. Corrigido no `zz-presenca-security.conf` (`SetEnvIf`) e com fallback em `Application::requestHeader()` |
| **Banco sem as travas do Supabase** | 8 `CHECK` + trigger de evento fechado replicados no `schema.sql`. Detalhes em [migracao_mysql.md](migracao_mysql.md) |
| **Ordem de subida** | Healthcheck no `db` + `depends_on: condition: service_healthy` — o backend não sobe antes do banco aceitar conexão |

---

## Antes de apertar o botão

```
[ ] 1. Seed do admin padrão removido; admin real criado com senha forte
[ ] 2. JWT_SECRET, MYSQL_PASSWORD e MYSQL_ROOT_PASSWORD gerados novos, fora do git
[ ] 3. HTTPS ativo e cookie com 'secure' => true
[ ] 4. ALLOWED_ORIGINS com o domínio real (nunca '*')
[ ] 5. Rate limiting no login
[ ] 6. API e frontend no mesmo domínio, cookie HttpOnly
[ ] 7. APP_ENV=prod no build
[ ] 8. Backup automatizado e restauração testada
[ ] 9. Bloco `ports` removido do serviço db
[ ] 10. CSVs e import_dados.sql apagados das máquinas de trabalho
```
