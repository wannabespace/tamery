locals {
  service_accounts = {
    tamery-api       = "API runtime"
    tamery-proxy     = "Proxy runtime"
    tamery-web       = "App, main, docs, share runtime"
    tamery-jobs      = "Migrate and purge jobs"
    tamery-scheduler = "Invokes the purge job"
    tamery-deploy    = "GitHub Actions deploys"
    tamery-tofu      = "Applies infra/ from GitHub Actions after approval"
    tamery-tofu-plan = "Plans infra/ from GitHub Actions"
    viewer           = "Read-only for agents"
  }

  project_roles = {
    tamery-deploy    = ["roles/run.developer"]
    tamery-tofu      = ["roles/owner"]
    tamery-tofu-plan = ["roles/viewer", "projects/${local.project}/roles/tofuPlanRefresh"]
    # Never a basic role: roles/viewer carries cloudsql.backupRuns.export and roles/reader reads bucket objects, and this account must never reach the database or a secret.
    viewer = [
      "roles/artifactregistry.reader",
      "roles/browser",
      "roles/certificatemanager.viewer",
      "roles/cloudkms.viewer",
      "roles/cloudscheduler.viewer",
      "roles/compute.networkViewer",
      "roles/errorreporting.viewer",
      "roles/iam.securityReviewer",
      "roles/iam.workloadIdentityPoolViewer",
      "roles/logging.viewer",
      "roles/monitoring.viewer",
      "roles/networksecurity.viewer",
      "roles/redis.viewer",
      "roles/run.viewer",
      "roles/secretmanager.viewer",
      "roles/serviceusage.serviceUsageViewer",
      "roles/storage.bucketViewer",
      "projects/${local.project}/roles/cloudSqlMetadataViewer",
    ]
  }

  runtime_accounts = toset([for workload in values(merge(local.services, local.jobs)) : workload.account])
}

resource "google_service_account" "this" {
  for_each = local.service_accounts

  account_id   = each.key
  display_name = each.value
}

resource "google_artifact_registry_repository_iam_member" "deploy_pushes" {
  repository = google_artifact_registry_repository.tamery.name
  location   = local.region
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.this["tamery-deploy"].member
}

resource "google_service_account_iam_member" "deploy_acts_as" {
  for_each = local.runtime_accounts

  service_account_id = google_service_account.this[each.value].name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.this["tamery-deploy"].member
}

resource "google_project_iam_custom_role" "sql_metadata_viewer" {
  role_id = "cloudSqlMetadataViewer"
  title   = "Cloud SQL metadata viewer"
  permissions = [
    "cloudsql.backupRuns.get",
    "cloudsql.backupRuns.list",
    "cloudsql.databases.get",
    "cloudsql.databases.list",
    "cloudsql.instances.get",
    "cloudsql.instances.list",
    "cloudsql.sslCerts.get",
    "cloudsql.sslCerts.list",
    "cloudsql.users.get",
    "cloudsql.users.list",
  ]
}

# Refreshing the Redis instance reads its auth string and the state bucket's binding reads its policy; roles/viewer carries neither. The state already holds that auth string.
resource "google_project_iam_custom_role" "tofu_plan_refresh" {
  role_id     = "tofuPlanRefresh"
  title       = "OpenTofu plan refresh"
  permissions = ["redis.instances.getAuthString", "storage.buckets.getIamPolicy"]
}

resource "google_project_iam_member" "this" {
  for_each = merge([
    for account, roles in local.project_roles : { for role in roles : "${account}/${role}" => { account = account, role = role } }
  ]...)

  project = local.project
  role    = each.value.role
  member  = google_service_account.this[each.value.account].member

  depends_on = [google_project_iam_custom_role.sql_metadata_viewer, google_project_iam_custom_role.tofu_plan_refresh]
}

# Created outside OpenTofu, and it holds the Redis auth string; the plan runs with -lock=false, so reading is enough.
resource "google_storage_bucket_iam_member" "tofu_plan_reads_state" {
  bucket = "${local.project}-tofu-state"
  role   = "roles/storage.objectViewer"
  member = google_service_account.this["tamery-tofu-plan"].member
}

# Compute's default account starts as a project editor, and nothing here runs as it.
resource "google_project_iam_member_remove" "default_compute_editor" {
  project = local.project
  role    = "roles/editor"
  member  = "serviceAccount:${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

# Any workflow can ask GitHub for a token, and publish-cli.yml does: each pool admits one workflow on main, so deploy.yml can never become an infra account.
resource "google_iam_workload_identity_pool" "this" {
  for_each = { deploy = "github", infra = "github-infra" }

  workload_identity_pool_id = each.value
}

resource "google_iam_workload_identity_pool_provider" "this" {
  for_each = google_iam_workload_identity_pool.this

  workload_identity_pool_id          = each.value.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_condition                = "assertion.workflow_ref == 'wannabespace/tamery/.github/workflows/${each.key}.yml@refs/heads/main'"
  attribute_mapping                  = { "google.subject" = "assertion.sub" }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# The repo uses GitHub's immutable subject (owner and repo IDs, see actions/oidc/customization/sub). It names the environment only for a job that declares one, and the infra environment's required reviewer gates that job.
resource "google_service_account_iam_member" "github" {
  for_each = {
    tamery-deploy    = { pool = "deploy", subject = "ref:refs/heads/main" }
    tamery-tofu      = { pool = "infra", subject = "environment:infra" }
    tamery-tofu-plan = { pool = "infra", subject = "ref:refs/heads/main" }
  }

  service_account_id = google_service_account.this[each.key].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principal://iam.googleapis.com/${google_iam_workload_identity_pool.this[each.value.pool].name}/subject/repo:wannabespace@125988462/tamery@895089213:${each.value.subject}"
}
