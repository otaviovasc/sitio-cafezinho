---
name: sitio-domain
description: Use em qualquer mudança envolvendo animais, produção de leite, medições, compras, vencimentos, documentos ou indicadores do sistema do sítio. Preserve dados originais e diferencie medição, estimativa e exclusão.
---

# Regras de domínio

- PostgreSQL é a fonte oficial.
- Preserve `rawAnimalLabel` e `rawValueText`.
- Medição pontual não representa produção diária recorrente.
- Total manhã + tarde é real quando medido assim; valores estimados nunca viram medição real.
- `NEEDS_REVIEW` não entra em totais confirmados; `EXCLUDED` não entra em indicadores.
- Não preencher dias ausentes ou fundir animais por similaridade sem confirmação.
- Documentos da mesma compra não criam despesas separadas.
- Todo indicador deve informar origem e limitação quando necessário.
