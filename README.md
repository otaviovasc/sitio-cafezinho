# Sítio Cafezinho

Aplicação interna, compartilhada e mobile-first para a rotina diária de uma propriedade leiteira familiar. Registra rebanho, leite, coleta do laticínio, mastite, peso, compras, receitas, saídas e documentos sem transformar estimativas em fatos.

## Funcionalidades

- animais, aliases do caderno, cadastro em massa, busca e filtros úteis;
- ciclo produtivo com novilha, lactação, seca e saídas, separado dos lotes operacionais de ordenha;
- histórico reprodutivo factual com cio, cobertura, resultado e parto;
- lotes configuráveis com rotina manhã+tarde ou somente manhã e histórico de movimentações;
- sessões parciais de pesagem, importação por transcrição, revisão de inconsistências e gráficos individuais;
- produção total diária do rebanho todo ou medida separadamente por lote, controle individual pontual e coleta do laticínio como fatos independentes;
- coleta rápida, com várias retiradas por dia, alerta de possível duplicidade, documentos e comparação factual com a produção;
- casos de mastite, ações informadas pela família, carência e histórico no animal, sem diagnóstico nem prescrição automática;
- importação de JSON transcrito por um assistente com prévia obrigatória, conferência do rebanho esperado, busca e filtros de inconsistência;
- compras rápidas, itens opcionais, fornecedores, vencimentos e pagamento simples;
- receitas esperadas ou recebidas, venda de leite, saída econômica do animal e resultado de caixa registrado;
- preço mensal editável do leite, histórico e estimativa sobre o volume efetivamente coletado, sem criar receita automática;
- fotos/PDFs em volume local ou em uma pasta Google Drive, reutilizados por compra, coleta, receita e saída;
- página Hoje com pendências reais, quatro ações prioritárias, resumo do dia e visão mensal;
- exportações CSV e backup/restauração PostgreSQL reproduzíveis.

A arquitetura é um monólito modular com regras puras, rotas por domínio, serviços transacionais e providers de storage. Veja [docs/architecture.md](docs/architecture.md) e [docs/feature-surface-map.md](docs/feature-surface-map.md).

## Começo rápido com Docker

```bash
cp .env.example .env
docker compose up --build
```

Acesse <http://localhost:3000> e entre com o valor de `APP_PASSWORD` do `.env`. O PostgreSQL e os uploads locais ficam em volumes Docker persistentes.

O Compose usa `SEED_DEMO_DATA=true` para carregar poucos dados fictícios claramente identificados: leite, coleta, mastite, ação, peso, ciclo produtivo, compras, receitas e uma saída. Esses dados existem somente para visualizar e testar o produto. Em Railway use obrigatoriamente `SEED_DEMO_DATA=false`; a produção começa sem lançamentos fictícios.

Para limpar completamente os dados locais:

```bash
docker compose down -v
```

## Desenvolvimento sem Docker para a aplicação

Com PostgreSQL disponível e `DATABASE_URL` configurada:

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

O Vite fica em `http://localhost:5173` e encaminha `/api` ao Hono em `http://localhost:3000`. O build de produção é servido integralmente pelo Hono.

## Comandos

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm backup:create
pnpm backup:restore --file=<arquivo>
pnpm google-drive:authorize
```

## Armazenamento

- Local: `STORAGE_MODE=local` e `LOCAL_STORAGE_PATH=/data/uploads`.
- Railway: `STORAGE_MODE=google_drive` com `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` e `GOOGLE_DRIVE_FOLDER_ID`.

Não há tela de conexão do Drive nem token no banco. A autorização é feita uma única vez com `pnpm google-drive:authorize`; veja [docs/google-drive-setup.md](docs/google-drive-setup.md).

Arquivos aceitos: JPEG, PNG, WebP e PDF, até 15 MB. Metadados e vínculos ficam no PostgreSQL; o binário fica no provider selecionado.

## Produção no Railway

O mesmo `Dockerfile` é usado localmente e no Railway. A aplicação lê `PORT` e `DATABASE_URL`, executa migrations e seed idempotente no pre-deploy e usa Google Drive, nunca o filesystem efêmero. Veja [docs/railway-deployment.md](docs/railway-deployment.md).

## Testes e operação

Os testes unitários cobrem regras de domínio, ciclo produtivo, peso, parsers de importação, autenticação, storage e seed. O Playwright cobre fluxos reais em desktop, celular e tablet, com screenshots de QA visual. A lista de superfícies está em [docs/feature-surface-map.md](docs/feature-surface-map.md). Para a validação conjunta da família, sigam [docs/qa-guide.md](docs/qa-guide.md).

Para cópias tabulares, use `/configuracoes/dados`. Para backup completo, siga [docs/backup-and-restore.md](docs/backup-and-restore.md), ensaie a restauração em banco descartável e mantenha também a pasta do Drive protegida. Não compartilhe `.env`, refresh tokens ou a senha da aplicação. Não há recuperação de senha: altere `APP_PASSWORD` no ambiente e reinicie o serviço.

## Limitações assumidas

Este MVP não possui usuários individuais, offline, OCR, pagamentos parciais, estoque, contabilidade, integrações bancárias, recomendação veterinária ou automações clínicas. O “resultado de caixa registrado” considera somente receitas recebidas e compras pagas no sistema; não é lucro econômico completo. Dias sem medição continuam ausentes e controles individuais permanecem pontuais.
