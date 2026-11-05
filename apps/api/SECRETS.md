# Secrets: operator runbook

Rules and reasons: `.agents/rules/api.md` → Secrets / environment. The key, the secrets and who reads them are in `infra/secrets.tf`.

`ENCRYPTION_SECRET` encrypts every `encryptedText`/`encryptedJson` column. `USER_KEY_SECRET` encrypts the per-workspace keys in `workspace_encryption_keys`, which are the inner layer of connection strings. In dev both are plaintext in `apps/api/.env`. In prod both are Secret Manager secrets, encrypted by the Cloud KMS key `secrets`.

Either secret may be a comma-separated keyring, current key first. A key must never contain a comma.

**Back up both values in a password manager.** Without that backup, losing the KMS key loses all data.

## Setting a value

In zsh on your own machine, so the value stays out of your shell history:

```bash
read -rs "S?Value: "; echo
printf %s "$S" | gcloud secrets versions add ENCRYPTION_SECRET --project=gen-lang-client-0721016191 --data-file=-
unset S
```

Only an instance that starts later sees the new value, so start a new revision. A job reads it on its next run.

```bash
gcloud run services update api --region=europe-west3 --revision-suffix="secrets-$(date +%s)"
```

## Rotation

Run the scripts as the `api-rotate` Cloud Run Job. Its command is `bun`, and the arguments pick the script. Each one is a dry run unless you pass `--execute`, and each is safe to re-run:

```bash
gcloud run jobs execute api-rotate --region=europe-west3 --wait --args=run,rotate:encryption-secret            # or rotate:user-key-secret
gcloud run jobs execute api-rotate --region=europe-west3 --wait --args=run,rotate:encryption-secret,--execute
```

The output is in the execution's logs.

**New key value:**

1. Back up `<new>`.
2. Set `<new>,<old>`. While the deploy overlaps, an instance still on `<old>` fails to read the rows a new instance just wrote; this lasts only seconds and is accepted.
3. Re-encrypt with the matching `rotate:*` script.
4. Set `<new>`.
5. Keep `<old>` in the backup until every database backup that predates step 3 has expired.

**The KMS key** rotates itself every 90 days. Never destroy one of its versions while a secret version encrypted under it is still enabled.

**Per-workspace keys:** `--args=run,rotate:connection-keys,--execute[,<workspaceId>...]`. It needs no env change.

## Incidents

- **Secret read by someone else** (the alert names who and from where):
  1. Rotate that secret.
  2. If it was `ENCRYPTION_SECRET` or `USER_KEY_SECRET`, run **New key value**.
- **Running API instance compromised:** it holds both keys and every other secret.
  1. Remove `tamery-api`'s `secretAccessor` bindings, which stops new instances from booting.
  2. Check the audit log, then deploy under a new service account.
  3. Rotate every secret and both key values.
- **Stop everything at once:** remove Secret Manager's binding on the KMS key. No instance can boot until it returns.
- **Key version scheduled for destruction by mistake:** restore it within the 120 days.
- **Lost KMS key:** create the secrets again under a new key and set the backed-up values. Without the backup, the data is gone.
- **Lost workspace key row:**
  1. Mint a new key with `workspaceEncryptionKey.create(workspaceId, db)`.
  2. Clear `connection_string` on that workspace's connections.
  3. Have the members re-enter their connection strings.
- **Restoring a backup from before a rotation:**
  1. Set `<current>,<retired>`.
  2. Restore the backup.
  3. Re-encrypt.
  4. Set `<current>`.
