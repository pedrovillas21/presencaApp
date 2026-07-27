# Migrations incrementais

Execute os arquivos no SQL Editor do Supabase, nesta ordem:

1. `202607270001_add_attendance_location.sql`
2. `202607270002_add_attendee_signature.sql`
3. `202607270003_delete_professional_cascade.sql`

Cada arquivo é idempotente e representa uma alteração isolada. O primeiro cria
e normaliza o local informado no check-in. O segundo cria o campo da assinatura
PNG e aceita `null` apenas para registros anteriores à mudança. O terceiro cria
uma função administrativa que exclui, em uma única transação, todas as presenças
vinculadas ao CPF de um profissional.

O arquivo `../schema.sql` continua sendo o schema-base histórico; não é
necessário reaplicá-lo para publicar esta funcionalidade.
