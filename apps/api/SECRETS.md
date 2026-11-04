# Secrets & KMS: operator runbook

Rules and reasons: `.agents/rules/api.md` → Secrets / environment.

`ENCRYPTION_SECRET` encrypts every `encryptedText`/`encryptedJson` column. `USER_KEY_SECRET` encrypts the per-workspace keys in `workspace_encryption_keys`, which are the inner layer of connection strings. In dev both are plaintext in `apps/api/.env`, and Cloud KMS is never contacted. In prod both are KMS-wrapped (`*_WRAPPED`).

Either secret may be a comma-separated keyring, current key first. A key must never contain a comma.

## Setup

1. **Back up** both plaintext values in a password manager, never in a platform env. Without this backup, losing the KMS key loses all data.
2. **KMS key:** Security → Key Management → a key ring in the API's region → Create key, purpose `Symmetric encrypt/decrypt`. Set **Scheduled for destruction** to the maximum, 120 days; it can only be set at creation, and it is the window for restoring a version someone destroys. Its full name is `KMS_KEY_NAME`: `projects/<project>/locations/<region>/keyRings/<ring>/cryptoKeys/<key>`.
3. **Access**, granted on the key, never on the project:
   - `roles/cloudkms.cryptoKeyDecrypter` for the API's service account only. The `api-rotate` job runs as that same account.
   - `roles/cloudkms.cryptoKeyEncrypter` for the operator who wraps. Nobody gets a decrypter role for convenience.
4. **Audit:** IAM & Admin → Audit Logs → Cloud Key Management Service → enable **Data Read**. Decrypt calls are not logged without it.
5. **Wrap** both values on your own machine (outside the platform), in zsh. Each run prints one `*_WRAPPED` value:

   ```bash
   read -rs "S?Secret: "; echo
   printf %s "$S" | gcloud kms encrypt --key="$KMS_KEY_NAME" --plaintext-file=- --ciphertext-file=- | base64 | tr -d '\n'; echo
   unset S
   ```

6. **Startup probe first**, on the API service: HTTP path `/health`, allowing at least 120s in total. Without it, a revision that fails to unwrap takes traffic and goes down instead of leaving the old revision serving.
7. **Variables**, on the API service and the `api-rotate` job:
   - Confirm the service runs the image's `CMD`, `apps/api`'s `start`. The unwrap is a preload inside that script.
   - Add `ENCRYPTION_SECRET_WRAPPED`, `USER_KEY_SECRET_WRAPPED` and `KMS_KEY_NAME`. No credential goes with them: the decrypt call authenticates as the service account.
   - Leave out the plaintext `ENCRYPTION_SECRET` and `USER_KEY_SECRET`.
   - The job also needs `NODE_ENV=production` and `DATABASE_URL`, since it does not go through `start`.

## Rotation

Run the scripts as the `api-rotate` Cloud Run Job, which has the API's image, service account, wrapped env and database network. Its command is `bun`, and the arguments pick the script. Each one is a dry run unless you pass `--execute`, and each is safe to re-run:

```bash
gcloud run jobs execute api-rotate --region=<region> --wait --args=run,rotate:encryption-secret            # or rotate:user-key-secret
gcloud run jobs execute api-rotate --region=<region> --wait --args=run,rotate:encryption-secret,--execute
```

The output is in the execution's logs.

**New key value**: every "set" below means wrap the value and update `*_WRAPPED` on the API service and the `api-rotate` job. Updating the service deploys a new revision.

1. Back up `<new>`.
2. Set `<new>,<old>`. While the deploy overlaps, an instance still on `<old>` fails to read the rows a new instance just wrote; this lasts only seconds and is accepted.
3. Re-encrypt with the matching `rotate:*` script.
4. Set `<new>`.
5. Keep `<old>` in the backup until every database backup that predates step 3 has expired.

**New KMS key, same value:** wrap the same plaintext under the new key, grant it as in Setup, then update `KMS_KEY_NAME` and both `*_WRAPPED` values. Stored data is untouched.

**New version of the same KMS key:** nothing to do. Decrypt finds the version from the ciphertext, so never destroy a version a `*_WRAPPED` value was made with.

**Per-workspace keys:** `--args=run,rotate:connection-keys,--execute[,<workspaceId>...]`. It needs no env change.

## Incidents

- **Env leak:** the wrapped values decrypt nothing without the service account.
  1. Check the Data Read audit log for decrypt calls by anyone other than the API's service account.
  2. Rotate everything else in the env (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `PROXY_SHARED_SECRET`, API and OAuth keys).
- **Running API instance compromised:** it can reach both the plaintext and the decrypt call.
  1. Remove the service account's decrypter binding on the key, which stops new instances from booting.
  2. Check the audit log, then deploy under a new service account.
  3. Do everything under **Env leak**, and rotate the key values as well.
- **Key version scheduled for destruction by mistake:** restore it within the 120 days.
- **Lost KMS key:** wrap the backed-up plaintext under a new key. Without the backup, the data is gone.
- **Lost workspace key row:**
  1. Mint a new key with `workspaceEncryptionKey.create(workspaceId, db)`.
  2. Clear `connection_string` on that workspace's connections.
  3. Have the members re-enter their connection strings.
- **Restoring a backup from before a rotation:**
  1. Set `<current>,<retired>`.
  2. Restore the backup.
  3. Re-encrypt.
  4. Set `<current>`.
