# Moving production from Railway to Google Cloud

Railway stays intact until the last step, and that is the rollback.

## Before the cutover

1. Replace the random placeholders in `ENCRYPTION_SECRET` and `USER_KEY_SECRET` with the real values (`apps/api/SECRETS.md`). They must match Railway's exactly, or encrypted data stops working. `BETTER_AUTH_SECRET` and the other secrets must match Railway's too, or sessions stop working.
2. In Cloudflare, set SSL/TLS to **Full (strict)**, upload the client certificate signed by `cloudflare-origin-pull-ca.pem`, and turn on zone-level **Authenticated Origin Pulls**.
3. Prove the mTLS path: add a proxied record `gcp-test.tamery.app` pointing at the load balancer (`gcloud compute addresses describe tamery-lb --global --project=gen-lang-client-0721016191`). `curl -I https://gcp-test.tamery.app` must answer without an `x-railway-request-id` header. Delete the record afterwards.
4. Add Railway's public database URL as a temporary secret, readable by the copy job only:

   ```bash
   read -rs "S?Railway DATABASE_URL: "; echo
   echo '{"userManaged": {"replicas": [{"location": "europe-west3", "customerManagedEncryption": {"kmsKeyName": "projects/gen-lang-client-0721016191/locations/europe-west3/keyRings/tamery/cryptoKeys/secrets"}}]}}' > /tmp/replication.json
   gcloud secrets create SOURCE_DATABASE_URL --project=gen-lang-client-0721016191 --replication-policy-file=/tmp/replication.json
   printf %s "$S" | gcloud secrets versions add SOURCE_DATABASE_URL --project=gen-lang-client-0721016191 --data-file=-
   unset S
   gcloud secrets add-iam-policy-binding SOURCE_DATABASE_URL --project=gen-lang-client-0721016191 \
     --member=serviceAccount:tamery-jobs@gen-lang-client-0721016191.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
   ```

5. Create the copy job. Cloud SQL has no public address, so it runs inside the VPC:

   ```bash
   gcloud run jobs create db-copy --project=gen-lang-client-0721016191 --region=europe-west3 --image=postgres:18 \
     --service-account=tamery-jobs@gen-lang-client-0721016191.iam.gserviceaccount.com --network=tamery --subnet=tamery-europe-west3 --vpc-egress=private-ranges-only \
     --set-secrets=SOURCE=SOURCE_DATABASE_URL:latest,TARGET=DATABASE_URL:latest --task-timeout=3600 --max-retries=0 \
     --command=sh --args=-c,'pg_dump --no-owner --no-acl --clean --if-exists "$SOURCE" | psql --set ON_ERROR_STOP=1 "$(echo "$TARGET" | sed s/no-verify/require/)"'
   ```

6. Rehearse while Railway keeps serving, since the copy only reads from it. Run the job, then both `api-rotate` dry runs (`apps/api/SECRETS.md`): they prove the keys decrypt the copied rows. Note how long the copy took, which is the length of the outage.
7. Turn off Railway's auto-deploy, then merge the PR. The first deploy targets only Google Cloud.

## The cutover

Lower the TTL of the DNS records beforehand. Pick a quiet hour: nobody can write between steps 1 and 4.

1. Stop Railway's api and proxy.
2. Run the copy again: `gcloud run jobs execute db-copy --project=gen-lang-client-0721016191 --region=europe-west3 --wait`
3. Run `api-migrate`, then compare row counts of `users` and `connections` on both sides.
4. Point the Cloudflare records at the load balancer, proxied.
5. Check it:
   - Sign in on the website and open a connection through the cloud proxy.
   - The session's IP address in the account page is yours, not empty.
   - `curl --resolve api.tamery.app:443:<lb-ip> https://api.tamery.app/health` from your machine fails the TLS handshake.
6. Set `paused = false` on the purge schedule in `run.tf` and apply.
7. Delete the `db-copy` job and the `SOURCE_DATABASE_URL` secret.

## Rolling back

**During the cutover, or after it with no writes you need to keep:** point the Cloudflare records back at Railway and start Railway's api and proxy. Railway's database has not changed since step 1. Turn its auto-deploy on only after reverting the merge.

**After users have written data:** decide quickly, since each minute adds data to carry back. Stop the Cloud Run traffic by pointing DNS back, then run the copy above with `SOURCE` and `TARGET` swapped.

**A bad deploy after the move:** in GitHub, **Actions → Deploy → Run workflow**, and enter the service under `rollback`. It runs the image from before that service's last deploy. It does not undo migrations, so a migration must stay compatible with the code before it.

## A week later

Delete the Railway services, once nothing else uses their database.
