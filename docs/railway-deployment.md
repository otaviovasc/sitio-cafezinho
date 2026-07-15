# Preparação para Railway

Nenhum deploy é executado nesta fase. O repositório está preparado para usar o mesmo `Dockerfile` validado localmente.

## Recursos

Crie um projeto com dois serviços:

1. PostgreSQL gerenciado, chamado por exemplo `Postgres`.
2. Aplicação apontando para este repositório/Dockerfile.

O `railway.json` seleciona `DOCKERFILE`, executa migration + seed idempotente no pre-deploy, inicia o servidor Hono, verifica `/api/ready` e reinicia somente em falha. O schema atual usa `multiRegionConfig` apenas para escala explícita; sem essa configuração, o serviço permanece singleton por padrão, que é o desejado neste MVP.

O arquivo foi conferido em 15/07/2026 contra a referência oficial de Config as Code. A escala continua sendo uma ação visível no painel e deve permanecer em uma réplica.

## Variáveis da aplicação

```text
NODE_ENV=production
APP_PASSWORD=<senha compartilhada com pelo menos 8 caracteres>
SESSION_SECRET=<segredo aleatório com pelo menos 32 caracteres>
PUBLIC_APP_URL=https://<domínio Railway>
SEED_DEMO_DATA=false
DATABASE_URL=${{Postgres.DATABASE_URL}}
STORAGE_MODE=google_drive
GOOGLE_CLIENT_ID=<Google OAuth client id>
GOOGLE_CLIENT_SECRET=<Google OAuth client secret>
GOOGLE_REFRESH_TOKEN=<gerado por pnpm google-drive:authorize>
GOOGLE_DRIVE_FOLDER_ID=<id da pasta criada pela família>
```

`PORT` é fornecida automaticamente pelo Railway. A aplicação escuta em `0.0.0.0:$PORT`. Não configure volume local para uploads em produção.

## Fluxo curto depois das credenciais

1. Adicione o PostgreSQL e a aplicação no projeto Railway.
2. Cadastre as variáveis acima no serviço da aplicação.
3. Gere um domínio público.
4. Dispare o deploy pelo painel/repositório.
5. Aguarde estado `SUCCESS`; não considere a fila/build como deploy concluído.
6. Abra `/entrar`, teste a senha e confirme que o banco de produção começa sem dados demonstrativos.
7. Execute o checklist real do Drive em [google-drive-setup.md](google-drive-setup.md).
8. Faça um redeploy e confirme persistência do banco e dos arquivos.

## Bloqueios externos atuais

- Projeto/serviços Railway ainda não foram criados ou vinculados por esta implementação.
- Credenciais Google e refresh token reais não foram fornecidos.
- Pasta do Drive e seu ID precisam ser criados pela família.
- Senha compartilhada, segredo de sessão e domínio público precisam ser definidos pelo responsável.
