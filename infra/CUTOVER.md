# Moving production from Railway to Google Cloud

Railway stays intact until the last step, and that is the rollback.

## Two weeks before

1. Tell customers who allowlist the proxy to add the addresses in `docs/connections/security.mdx`, next to the old ones. Their connections break at the cutover otherwise.
2. Replace the random placeholders in `ENCRYPTION_SECRET` and `USER_KEY_SECRET` with the real values (`apps/api/SECRETS.md`). They must match Railway's exactly, or encrypted data stops working. `BETTER_AUTH_SECRET` and the other secrets must match Railway's too, or sessions stop working.
3. In Cloudflare, add the certificate's DNS authorization record (`gcloud certificate-manager dns-authorizations describe tamery-app --project=tamery-prod`) as DNS only, and wait for the certificate to turn `ACTIVE`.
4. In Cloudflare, set SSL/TLS to **Full (strict)**, upload the client certificate signed by `cloudflare-origin-pull-ca.pem`, and turn on zone-level **Authenticated Origin Pulls**.
5. Turn off Railway's auto-deploy, then merge the PR. The first deploy targets only Google Cloud.

## The cutover

Lower the TTL of the DNS records a day ahead. Pick a quiet hour: nobody can write between steps 1 and 4.

1. Stop Railway's api and proxy.
2. Copy the database from inside the VPC, since Cloud SQL has no public address. `SOURCE_DATABASE_URL` is Railway's public URL, added as a temporary secret:

   ```bash
   gcloud run jobs create db-copy --project=tamery-prod --region=europe-west3 --image=postgres:18 \
     --service-account=tamery-jobs@tamery-prod.iam.gserviceaccount.com --network=tamery --subnet=tamery-europe-west3 --vpc-egress=private-ranges-only \
     --set-secrets=SOURCE=SOURCE_DATABASE_URL:latest,TARGET=DATABASE_URL:latest --task-timeout=3600 --max-retries=0 \
     --command=sh --args=-c,'pg_dump --no-owner --no-acl --clean --if-exists "$SOURCE" | psql --set ON_ERROR_STOP=1 "$TARGET"'
   gcloud run jobs execute db-copy --project=tamery-prod --region=europe-west3 --wait
   ```

3. Run `api-migrate`, then compare row counts of `users` and `connections` on both sides.
4. Point the Cloudflare records at the load balancer (`gcloud compute addresses describe tamery-lb --global --project=tamery-prod`), proxied.
5. Check it:
   - Sign in on the website and open a connection through the cloud proxy.
   - The session's IP address in the account page is yours, not empty.
   - `curl --resolve api.tamery.app:443:<lb-ip> https://api.tamery.app/health` from your machine fails the TLS handshake.
6. Set `paused = false` on the purge schedule in `run.tf` and apply.
7. Delete the `db-copy` job and the `SOURCE_DATABASE_URL` secret.

## Rolling back

**During the cutover, or after it with no writes you need to keep:** point the Cloudflare records back at Railway and start Railway's api and proxy. Railway's database has not changed since step 1. Turn its auto-deploy on only after reverting the merge.

**After users have written data:** decide quickly, since each minute adds data to carry back. Stop the Cloud Run traffic by pointing DNS back, then run the copy above with `SOURCE` and `TARGET` swapped, using a URL that reaches Railway.

**A bad deploy after the move:** in GitHub, **Actions → Deploy → Run workflow**, and pick the service under `rollback`. It runs the image from before that service's last deploy. It does not undo migrations, so a migration must stay compatible with the code before it.

## A week later

Delete the Railway services, and the Google Cloud project this one replaced.
