# Railway Storage Bucket

O sistema usa um bucket privado e S3-compatible no mesmo projeto Railway da aplicação. Não existe tela de configuração nem credencial no banco ou no cliente.

## Configuração

1. No ambiente `production`, crie um Storage Bucket na região adequada.
2. No serviço da aplicação, injete as credenciais do bucket como variáveis de referência:

```text
STORAGE_MODE=railway_bucket
AWS_ENDPOINT_URL=${{sitio-documentos.ENDPOINT}}
AWS_ACCESS_KEY_ID=${{sitio-documentos.ACCESS_KEY_ID}}
AWS_SECRET_ACCESS_KEY=${{sitio-documentos.SECRET_ACCESS_KEY}}
AWS_S3_BUCKET_NAME=${{sitio-documentos.BUCKET}}
AWS_DEFAULT_REGION=${{sitio-documentos.REGION}}
```

Troque `sitio-documentos` pelo nome real do recurso. O backend envia, abre e exclui os objetos; as credenciais nunca vão para o navegador.

## Checklist com bucket real

- [ ] Enviar JPEG pela tela Documentos
- [ ] Confirmar o objeto no bucket
- [ ] Abrir/baixar pelo sistema
- [ ] Enviar PDF no detalhe de uma compra
- [ ] Excluir e confirmar remoção no bucket
- [ ] Fazer redeploy e confirmar que o arquivo continua acessível
