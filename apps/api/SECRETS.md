# Secrets, KMS & key rotation: operator runbook

Step-by-step for a human operator: setting up Infisical KMS, rotating every key, and recovering when something is lost. The rules and their reasons live in `.agents/rules/api.md` → Secrets / environment.

---

## 1. The key model

```text
connection string at rest   = ENCRYPTION_SECRET( userKey( plaintext ) )
user_encryption_keys.secret = USER_KEY_SECRET( userKey )
other encrypted columns     = ENCRYPTION_SECRET( plaintext )
```

| Secret | Protects | Where it lives |
| --- | --- | --- |
| `ENCRYPTION_SECRET` | every `encryptedText`/`encryptedJson` column (the outer layer of connection strings, plus queries, chat messages and share views) | dev: `.env`. Prod: KMS-wrapped |
| `USER_KEY_SECRET` | each per-user key in `user_encryption_keys.secret` | dev: `.env`. Prod: KMS-wrapped |
| per-user key | the inner layer of that user's connection strings | only in `user_encryption_keys`, wrapped by `USER_KEY_SECRET` |

The two env secrets are wrapped with KMS so that a leaked platform env exposes only the wrapped blobs and a revocable Infisical credential, never the keys themselves.

Each env secret may be a **keyring**: a comma-separated list with the current key first. New writes use the current key, and every key is tried on decrypt. That is what makes rotation zero-downtime. **A key must never contain a comma.**

---

## 2. Local development

There is nothing to set up. Keep plaintext `ENCRYPTION_SECRET` / `USER_KEY_SECRET` in `apps/api/.env`. When the plaintext is present, boot skips unwrapping and Infisical is never contacted.

---

## 3. Production setup

### 3.1 KMS key

Infisical → KMS project → **Add Key**:

- Key Usage: `Encrypt/Decrypt`
- Algorithm: `AES-256-GCM`
- **Allow Export: OFF.** The key must never leave KMS. This cannot be changed later.
- **Delete Protection: ON.** Deleting the key makes every wrapped blob unrecoverable.

Its key id is `INFISICAL_KMS_KEY_ID`.

### 3.2 Machine identity

1. Organization → **Access Control → Machine Identities → Create**. Universal Auth is on by default.
2. On the identity page, choose **Add Client Secret**. Copy the Client ID and the Client Secret into `INFISICAL_CLIENT_ID` / `INFISICAL_CLIENT_SECRET`.
3. In the KMS project, go to **Access Control → Machine Identities → Add Machine Identity to Project**. Assign the role **Cryptographic Operator**, which can use keys but cannot see, create or change them.

### 3.3 Back up the plaintext first

Before anything else, store the current plaintext `ENCRYPTION_SECRET` and `USER_KEY_SECRET` in a password manager or an offline encrypted file, **outside any platform env**. This backup is your recovery material (§5.1).

Pre-flight check: neither value may contain a comma (§1).

```bash
[[ "$CURRENT_ENCRYPTION_SECRET$CURRENT_USER_KEY_SECRET" == *,* ]] && echo "contains a comma — stop"
```

### 3.4 Wrap the secrets

Run this from your machine with the Infisical credentials exported. The plaintext goes in over stdin, so it never appears in shell history or the process list:

```bash
export INFISICAL_CLIENT_ID=... INFISICAL_CLIENT_SECRET=... INFISICAL_KMS_KEY_ID=...
# self-hosted Infisical only: export INFISICAL_SITE_URL=https://your-instance

echo -n "$CURRENT_ENCRYPTION_SECRET" | bun run apps/api/scripts/wrap-secret.ts
echo -n "$CURRENT_USER_KEY_SECRET"   | bun run apps/api/scripts/wrap-secret.ts
```

### 3.5 Railway variables

Make these changes **in every API service**:

1. Check that the service's start command is `apps/api`'s `start` script (`bun run start` there), not a custom command such as `bun index.ts`. The unwrap runs as a preload inside that script, so any other command boots without it and crashes once the plaintext is gone.
2. Add:
   - `ENCRYPTION_SECRET_WRAPPED` and `USER_KEY_SECRET_WRAPPED`: the outputs from §3.4
   - `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, `INFISICAL_KMS_KEY_ID`
   - `INFISICAL_SITE_URL`: only for self-hosted Infisical
3. Remove the plaintext `ENCRYPTION_SECRET` and `USER_KEY_SECRET`.
4. Redeploy.

If unwrapping fails, boot retries for about 30s and the process never starts listening, so the rolling deploy keeps the old instance serving. A missing `INFISICAL_*` variable fails immediately, without retries.

From now on, never roll back to a build whose `start` script lacks the `--preload` of `lib/unwrap-secrets.ts`: it reads `ENCRYPTION_SECRET` before anything unwraps it and crashes at boot.

### 3.6 Healthcheck

API service → Settings:

- Healthcheck Path: `/health`
- Healthcheck Timeout: at least 120s

Note that `/health` also fails when OpenRouter is unreachable.

---

## 4. Rotation

### 4.1 Running the scripts

Run the scripts **inside the API service**, where the wrapped env, the Infisical credentials and the private network to the database are all available. Always start them with `bun run rotate:*` from `apps/api`. That runs the same unwrap preload as `start`, so no plaintext secret ever passes through your shell:

```bash
railway ssh --service <api-service>
cd apps/api   # skip if the service already starts there
NODE_ENV=production bun run rotate:encryption-secret              # dry run
NODE_ENV=production bun run rotate:encryption-secret --execute    # apply
```

The scripts are `rotate:encryption-secret`, `rotate:user-key-secret` and `rotate:connection-keys`. `NODE_ENV` is required because the service's `start` script sets it itself. Every script is a dry run unless you pass `--execute`.

### 4.2 Re-wrap: new KMS key, same key value

Stored data is untouched.

1. Create a new KMS key (§3.1).
2. Re-wrap the **same** plaintext (§3.4) under the new key.
3. Update `INFISICAL_KMS_KEY_ID` and both `*_WRAPPED` variables in every API service, then redeploy.
4. Once the new key works, remove the old one. You will have to turn off its Delete Protection first.

### 4.3 New value for `ENCRYPTION_SECRET` or `USER_KEY_SECRET`

This is zero-downtime. Every step must reach **every API service and instance** before you start the next. Each "set" below means: wrap the value (§3.4), update the `*_WRAPPED` variable, and redeploy.

1. **Back up `<new>`** next to `<old>` (§3.3) **before** anything else: rows start being written under it in step 3.
2. **Set `<old>,<new>`.** Every instance can now read the new key, but still writes under the old one.
3. **Set `<new>,<old>`.** Writes switch to the new key, and old rows still open.
4. **Re-encrypt.** Run the matching script (§4.1): `rotate:encryption-secret` for `ENCRYPTION_SECRET`, `rotate:user-key-secret` for `USER_KEY_SECRET`. Do a dry run first, then `--execute`. It is safe to re-run if interrupted, and it skips rows the app rewrote in the meantime.
5. **Set `<new>`.** The old key is retired from the live keyring.
6. **Keep `<old>` in the backup** until every database backup and point-in-time recovery window that predates step 4 has expired. Re-encryption rewrites only the live database; those backups still hold rows under `<old>` (§5.4). Only then remove it.

Do not skip step 2. If you go straight to `<new>,<old>`, an instance still on `<old>` will hit rows it cannot open.

### 4.4 Per-user keys

This rotates the inner connection-string key. It needs no env change and no redeploy. Each user is processed in their own transaction, and a failure rolls back only that user.

```bash
NODE_ENV=production bun run rotate:connection-keys --execute [userId ...]
```

Without user ids it rotates every user.

---

## 5. Disaster recovery

### 5.1 Lost the KMS key (deleted, access lost, Infisical gone)

With export off, the `*_WRAPPED` blobs can no longer be unwrapped.

- **With the §3.3 backup:** create a new KMS key, wrap the backed-up plaintext, update the variables and redeploy. No data is lost and no migration is needed.
- **Without the backup:** all data encrypted under those secrets is lost. That is why the backup is mandatory and Delete Protection is on.

### 5.2 Suspected env-store leak

1. **Revoke the Infisical machine identity immediately.** The stolen `*_WRAPPED` blobs become useless once nothing can unwrap them.
2. Check the Infisical audit log for decrypt calls made by that identity.
3. Create a new identity (§3.2), update the variables, and redeploy.
4. Rotate every other secret that was in the env: `DATABASE_URL`, API keys, OAuth secrets, `BETTER_AUTH_SECRET`, `PROXY_SHARED_SECRET`, and so on. KMS protected the wrapping keys, but not these.
5. As defense in depth, also rotate the wrapping-key values (§4.3).

### 5.3 Lost a user's key row

A user's key exists only in their `user_encryption_keys` row, and there is no backup of it by design: deleting a user crypto-shreds their data. If the row is gone, `userEncryptionKey.get` throws `No encryption key for user`, and every connection string in the workspaces that user owns stops opening. Nothing re-creates the key automatically, because it is only minted when the user is created. To recover:

1. Mint a new key with a one-off call to `userEncryptionKey.create(userId)` (`apps/api/lib/encryption-key.ts`).
2. Clear `connection_string` on those workspaces' connections. The old ciphertext can never be opened again.
3. Have the user re-enter their connection strings.

### 5.4 Restoring a database backup taken before a rotation

The restored rows are under the key that was current when the backup was taken, which may since have been retired (§4.3). Bring it back from the backup kept in §4.3 step 6 and roll it through the keyring before the data returns:

1. **Set `<current>,<retired>`** in every API service and redeploy. Writes stay on the current key, and the restored rows will open.
2. Restore the backup.
3. **Re-encrypt** (§4.1), dry run first, then `--execute`.
4. **Set `<current>`.**

Per-user keys need nothing extra: a backup holds each user's key row together with the connection strings it opens.
