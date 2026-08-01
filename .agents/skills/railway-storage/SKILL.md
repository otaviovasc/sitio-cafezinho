---
name: railway-storage
description: Use em mudanças de deploy, Docker, Railway, PostgreSQL de produção, Storage Buckets, uploads e persistência de arquivos.
---

# Infraestrutura e arquivos

- Local usa Docker e storage local; produção usa PostgreSQL central e Railway Storage Bucket.
- Não dependa do filesystem efêmero em produção; use `PORT` e `DATABASE_URL`.
- O bucket é privado e acessado somente pelo servidor com credenciais S3 injetadas por referências Railway.
- Execute migrations antes do start e mantenha seed idempotente.
- Valide upload, download, exclusão e persistência após redeploy.
