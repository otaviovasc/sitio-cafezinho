# Plano de operações diárias

Plano curto para evoluir o sistema existente sem reescrever a arquitetura nem transformar o sítio em um ERP genérico.

## Ordem de entrega

1. Remover dos serviços, rotas, interface, testes e documentação a exclusividade entre produção agregada e controle individual. A produção diária pode ter escopo geral ou por lote, com unicidade por data e escopo.
2. Criar coletas do laticínio, com registro rápido, comparação factual com a produção e documentos no provider existente.
3. Criar casos e ações de mastite, incluindo carência informada, histórico no animal e pendências de hoje, sem diagnóstico ou protocolo automático.
4. Criar receitas e saída econômica dos animais, com criação transacional e opcional de uma única receita para vendas.
5. Reorganizar a rota principal como **Hoje**, integrar os três fatos do leite e apresentar caixa registrado sem chamar o resultado de lucro.
6. Adicionar exportações CSV, scripts reproduzíveis de backup/restauração, documentação e validações local, visual e de infraestrutura.

## Migrações previstas

- Migration aditiva para `milk_collections`, `mastitis_cases`, `mastitis_actions`, `revenues` e `animal_exits`, seus enums, índices, checks e chaves estrangeiras.
- Ampliação aditiva de `attachments` para vincular um documento a coleta, receita ou saída, mantendo os vínculos atuais com compra e controle individual e garantindo no máximo um pai.
- Migration aditiva de `daily_milk_totals.herd_group_id`, com índices parciais para um registro geral por data e um registro por lote/data. Linhas existentes permanecem gerais por usarem `null`.
- Nenhuma tabela histórica de leite será removida ou recalculada. A exclusividade atual não existe como constraint cruzada no PostgreSQL; ela será retirada do código de aplicação.

## Dados e riscos

- `daily_milk_totals`, `milk_sessions`, `milk_measurements`, `rawAnimalLabel`, `rawValueText`, datas, status de revisão e registros excluídos serão preservados literalmente.
- Produção geral, produção por lote, soma do controle individual e coleta serão exibidas como fatos independentes. Indicadores preferem o geral e, quando ausente, identificam a soma dos lotes registrados; diferenças não serão classificadas automaticamente como perda ou erro.
- Carência será sempre descrita como data informada; o sistema nunca liberará o leite automaticamente.
- Saída com valor poderá criar uma receita somente por escolha explícita. Morte nunca criará receita.
- Compras e anexos existentes não serão duplicados. O mesmo provider local/Google Drive continuará responsável pelos binários.
- Backup PostgreSQL local será criado e validado antes da migration. A restauração será ensaiada em banco descartável antes da conclusão.

## Rollback

O rollback seguro é restaurar o backup pré-migration em um banco vazio. Como as mudanças são aditivas, versões anteriores da aplicação ignoram as novas tabelas, mas o schema antigo não deve ser recriado por `DROP` em produção. Antes do deploy, será obrigatório novo backup, `SEED_DEMO_DATA=false` e confirmação dos providers externos.
