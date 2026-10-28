# Secrets & KMS: operator runbook

Rules and reasons: `.agents/rules/api.md` → Secrets / environment.

`ENCRYPTION_SECRET` encrypts every `encryptedText`/`encryptedJson` column. `USER_KEY_SECRET` encrypts the per-workspace keys in `workspace_encryption_keys`, which are the inner layer of connection strings. In dev both are plaintext in `apps/api/.env`, and Infisical is never contacted. In prod both are KMS-wrapped (`*_WRAPPED`).

Either secret may be a comma-separated keyring, current key first. A key must never contain a comma.

## Setup

1. **Back up** both plaintext values in a password manager, never in a platform env. Without this backup, losing the KMS key loses all data.
2. **KMS key:** Infisical → KMS project → Add Key, `Encrypt/Decrypt`, `AES-256-GCM`. Set **Allow Export OFF**; this cannot be changed later. Set **Delete Protection ON**.
3. **Machine identity:**
   - Organization → Access Control → Machine Identities → Create, then Add Client Secret.
   - Add the identity to the KMS project with the role **Cryptographic Operator**.
4. **Wrap** both values on your own machine (outside the platform), from the repo root, in zsh. Each run prints one `*_WRAPPED` value:

   ```bash
   read -rs "INFISICAL_CLIENT_ID?Client ID: "; echo
   read -rs "INFISICAL_CLIENT_SECRET?Client Secret: "; echo
   read -rs "INFISICAL_KMS_KEY_ID?KMS key id: "; echo
   export INFISICAL_CLIENT_ID INFISICAL_CLIENT_SECRET INFISICAL_KMS_KEY_ID
   read -rs "S?Secret: "; echo; printf %s "$S" | bun run apps/api/scripts/wrap-secret.ts; unset S
   ```

5. **Healthcheck first**, in every API service: path `/health`, timeout at least 120s. Without it, a deploy that fails to unwrap takes traffic and goes down instead of leaving the old instance serving.
6. **Variables**, in every API service:
   - Confirm the start command is `apps/api`'s `bun run start`. The unwrap is a preload inside that script.
   - Add `ENCRYPTION_SECRET_WRAPPED`, `USER_KEY_SECRET_WRAPPED`, `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET` and `INFISICAL_KMS_KEY_ID`.
   - Remove the plaintext `ENCRYPTION_SECRET` and `USER_KEY_SECRET`.
   - Redeploy.

## Rotation

Run the scripts inside an API service, which holds the wrapped env and the database network. Each one is a dry run unless you pass `--execute`, and each is safe to re-run:

```bash
railway ssh --service <api-service>
cd apps/api
NODE_ENV=production bun run rotate:encryption-secret [--execute]   # or rotate:user-key-secret
```

**New key value**: every "set" below means wrap the value, update `*_WRAPPED`, and redeploy every API service.

1. Back up `<new>`.
2. Set `<new>,<old>`. While the deploy overlaps, an instance still on `<old>` fails to read the rows a new instance just wrote; this lasts only seconds and is accepted.
3. Re-encrypt with the matching `rotate:*` script.
4. Set `<new>`.
5. Keep `<old>` in the backup until every database backup that predates step 3 has expired.

**New KMS key, same value:** wrap the same plaintext under the new key, then update `INFISICAL_KMS_KEY_ID` and both `*_WRAPPED` values. Stored data is untouched.

**Per-workspace keys:** `bun run rotate:connection-keys --execute [workspaceId ...]`. It needs no env change.

## Incidents

- **Env leak:**
  1. Revoke the machine identity.
  2. Check the Infisical audit log for decrypt calls.
  3. Create a new identity.
  4. Rotate everything else in the env (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `PROXY_SHARED_SECRET`, API and OAuth keys).
  5. Rotate the key values as well.
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
