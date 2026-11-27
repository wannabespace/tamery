# Secrets: operator runbook

Rules and reasons: `.agents/rules/api.md` → Secrets / environment. The key, the secrets and who reads them are in `infra/secrets.tf`.

`ENCRYPTION_SECRET` encrypts every `encryptedText`/`encryptedJson` column. `USER_KEY_SECRET` encrypts the per-workspace keys in `workspace_encryption_keys`, which are the inner layer of connection strings. In dev both are plaintext in `apps/api/.env`. In prod both are Secret Manager secrets, encrypted by the Cloud KMS key `secrets`.

Either secret may be a comma-separated keyring, current key first. A key must never contain a comma and must be at least 32 characters, or the api refuses to start.

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

## Adding, renaming or retiring a secret

Every name in `api_secrets` (`infra/secrets.tf`) is a secret the api mounts at `latest`. OpenTofu refuses to destroy one, so a name never disappears together with its value while a revision still reads it.

1. **Add:** push the name and apply from Cloud Shell (`.agents/rules/monorepo.md` → Deploys): `tamery-tofu` may not create secrets or bindings. The apply creates the secret, then stops at the `api` service, which cannot mount a secret with no value: set it (above) and apply again.
2. **Rename:** add the new name beside the old one, set its value, and ship the code that reads it. The old name keeps the running revision booting until the new one takes over.
3. **Retire:** drop the name and the `prevent_destroy` in one change and apply from Cloud Shell, only if the plan destroys just that secret and its bindings, and put `prevent_destroy` back in the next change. The bindings are `create_before_destroy`, so the apply updates every service and job that mounted the name before it revokes the binding and deletes the secret, and the running revision keeps booting until the new one is up. A binding created before that flag was added has it in the state only after one more apply: keep such a name in `retired_api_secrets`, which keeps the secret and the api's binding without mounting it, for one apply first.

## Rotation

Run the scripts as the `api-rotate` Cloud Run Job. Its command is `bun`, and the arguments pick the script. Each one is a dry run unless you pass `--execute`, and each is safe to re-run:

```bash
gcloud run jobs execute api-rotate --region=europe-west3 --wait --args=run,rotate:encryption-secret            # or rotate:user-key-secret
gcloud run jobs execute api-rotate --region=europe-west3 --wait --args=run,rotate:encryption-secret,--execute
```

The output is in the execution's logs.

Each run, like any job you execute by hand, sends the "Deploy outside the Deploy workflow" alert, and so does an Infra apply that changes a Cloud Run service or job.

**New key value:**

1. Back up `<new>`.
2. Set `<new>,<old>`. While the deploy overlaps, an instance still on `<old>` fails to read the rows a new instance just wrote; this lasts only seconds and is accepted.
3. Re-encrypt with the matching `rotate:*` script.
4. Set `<new>`.
5. Keep `<old>` in the backup until every database backup that predates step 3 has expired.

**The KMS key** rotates itself every 90 days. Never destroy one of its versions while a secret version encrypted under it is still enabled.

**Per-workspace keys:** `--args=run,rotate:connection-keys,--execute[,<workspaceId>...]`. It needs no env change.

## Attachments

The api and the purge job reach the chat attachments bucket with an HMAC key of `tamery-attachments`, kept as `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`. OpenTofu never creates the key, so the secret stays out of the state.

**First key or a new one:**

1. Create a key. The output shows its access ID and secret once:

   ```bash
   gcloud storage hmac create tamery-attachments@gen-lang-client-0721016191.iam.gserviceaccount.com --project=gen-lang-client-0721016191
   ```

2. Set `S3_ACCESS_KEY_ID` to the access ID and `S3_SECRET_ACCESS_KEY` to the secret (**Setting a value**), then start a new api revision.
3. When replacing a key, deactivate and delete the old one only after the new revision serves:

   ```bash
   gcloud storage hmac update <old access ID> --deactivate --project=gen-lang-client-0721016191
   gcloud storage hmac delete <old access ID> --project=gen-lang-client-0721016191
   ```

**The KMS key `attachments`** encrypts the bucket and rotates itself every 90 days. Revoking Cloud Storage's binding on it stops every attachment from opening.

**Attachment links** (`/attachments/…?sig=`, what a model provider fetches a chat file from) never expire. Their signing key is derived from `ENCRYPTION_SECRET`'s current value, so step 2 of **New key value** for it revokes every link at once. To revoke the links alone, change the label `tamery/attachment-link/v1` in `apps/api/lib/attachments.ts` and deploy.

## Incidents

- **Secret read by someone else** (the alert names who and from where):
  1. Rotate that secret.
  2. If it was `ENCRYPTION_SECRET` or `USER_KEY_SECRET`, run **New key value**. If it was an `S3_*` key, replace the HMAC key (**Attachments**).
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
