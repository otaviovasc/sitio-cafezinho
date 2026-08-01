# Deploy no Railway

## Recursos

Crie um projeto com três recursos:

1. PostgreSQL gerenciado, chamado por exemplo `Postgres`.
2. Aplicação apontando para este repositório/Dockerfile.
3. Storage Bucket privado, chamado por exemplo `sitio-documentos`.

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
STORAGE_MODE=railway_bucket
AWS_ENDPOINT_URL=${{sitio-documentos.ENDPOINT}}
AWS_ACCESS_KEY_ID=${{sitio-documentos.ACCESS_KEY_ID}}
AWS_SECRET_ACCESS_KEY=${{sitio-documentos.SECRET_ACCESS_KEY}}
AWS_S3_BUCKET_NAME=${{sitio-documentos.BUCKET}}
AWS_DEFAULT_REGION=${{sitio-documentos.REGION}}
```

`PORT` é fornecida automaticamente pelo Railway. A aplicação escuta em `0.0.0.0:$PORT`. Não configure volume local para uploads em produção.

## Fluxo curto

1. Adicione o PostgreSQL e a aplicação no projeto Railway.
2. Crie o bucket e injete as referências acima no serviço da aplicação.
3. Gere um domínio público.
4. Dispare o deploy pelo painel/repositório.
5. Aguarde estado `SUCCESS`; não considere a fila/build como deploy concluído.
6. Abra `/entrar`, teste a senha e confirme que o banco de produção começa sem dados demonstrativos.
7. Execute o checklist real em [railway-bucket-setup.md](railway-bucket-setup.md).
8. Faça um redeploy e confirme persistência do banco e dos arquivos.

As credenciais devem permanecer como referências ao recurso, sem cópia para o repositório ou para o cliente.
