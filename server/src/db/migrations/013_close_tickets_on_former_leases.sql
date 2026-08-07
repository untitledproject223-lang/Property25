-- Close open/pending tickets that still belong to terminated (former) leases
UPDATE issues i
SET
  status = 'resolved',
  updated_at = now(),
  messages_json = COALESCE(i.messages_json, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'author', 'agent',
      'body', 'Ticket closed automatically because the lease was terminated.',
      'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  )
FROM tenants t
WHERE t.id = i.tenant_id
  AND t.status = 'former'
  AND i.status IN ('open', 'pending');
