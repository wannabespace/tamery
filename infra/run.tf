locals {
  public_urls = {
    API_URL  = "https://api.${local.domain}"
    MAIN_URL = "https://${local.domain}"
  }

  web_service = {
    account     = "tamery-web"
    memory      = "512Mi"
    min         = 0
    max         = 5
    concurrency = 80
    cpu_idle    = true
    timeout     = "300s"
    egress      = null
    tags        = []
    env         = {}
    secrets     = []
    health      = null
  }

  services = {
    app   = local.web_service
    main  = local.web_service
    docs  = local.web_service
    share = local.web_service

    # Holds transactions and the cancel map in memory, so it stays one instance and takes every user's queries.
    proxy = merge(local.web_service, {
      account     = "tamery-proxy"
      memory      = "1Gi"
      max         = 1
      concurrency = 500
      cpu_idle    = false
      timeout     = "3600s"
      egress      = "ALL_TRAFFIC"
      tags        = ["tamery-proxy"]
      env         = local.public_urls
      secrets     = ["PROXY_SHARED_SECRET"]
    })

    api = merge(local.web_service, {
      account = "tamery-api"
      memory  = "1Gi"
      min     = 1
      # Each open client holds up to seven sync streams, and each one counts.
      concurrency = 1000
      cpu_idle    = false
      timeout     = "3600s"
      egress      = "PRIVATE_RANGES_ONLY"
      env         = merge(local.public_urls, { REDIS_CA = google_redis_instance.tamery.server_ca_certs[0].cert })
      secrets     = local.api_secrets
      # A revision that cannot reach its database must never take traffic.
      health = "/health"
    })
  }

  jobs = {
    api-migrate = {
      account = "tamery-jobs"
      command = ["pnpm"]
      args    = ["--filter", "@tamery/db", "run", "drizzle:migrate"]
      timeout = "600s"
      retries = 0
      env     = {}
      secrets = ["DATABASE_URL"]
    }
    api-purge-deleted-records = {
      account = "tamery-jobs"
      command = ["pnpm"]
      args    = ["--filter", "@tamery/db", "purge-deleted-records"]
      timeout = "1800s"
      retries = 1
      env     = { NODE_ENV = "production" }
      secrets = ["DATABASE_URL"]
    }
    api-rotate = {
      account = "tamery-api"
      command = ["bun"]
      args    = ["run", "rotate:encryption-secret"]
      timeout = "3600s"
      retries = 0
      env     = { NODE_ENV = "production" }
      secrets = ["DATABASE_URL", "ENCRYPTION_SECRET", "USER_KEY_SECRET"]
    }
  }
}

resource "google_cloud_run_v2_service" "this" {
  for_each = local.services

  name     = each.key
  location = local.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  # Public by design, so all three must stay together: the load balancer's mTLS is the only way in.
  invoker_iam_disabled = true
  default_uri_disabled = true

  template {
    service_account                  = google_service_account.this[each.value.account].email
    timeout                          = each.value.timeout
    max_instance_request_concurrency = each.value.concurrency

    scaling {
      min_instance_count = each.value.min
      max_instance_count = each.value.max
    }

    dynamic "vpc_access" {
      for_each = each.value.egress == null ? [] : [each.value.egress]
      content {
        egress = vpc_access.value
        network_interfaces {
          network    = google_compute_network.tamery.name
          subnetwork = google_compute_subnetwork.tamery.name
          tags       = each.value.tags
        }
      }
    }

    containers {
      image = "${local.registry}/${each.key}:bootstrap"

      resources {
        limits = {
          cpu    = "1"
          memory = each.value.memory
        }
        cpu_idle          = each.value.cpu_idle
        startup_cpu_boost = true
      }

      ports {
        name           = "http1"
        container_port = 8080
      }

      dynamic "env" {
        for_each = each.value.env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = toset(each.value.secrets)
        content {
          name = env.value
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      dynamic "startup_probe" {
        for_each = each.value.health == null ? [] : [each.value.health]
        content {
          timeout_seconds   = 5
          period_seconds    = 5
          failure_threshold = 24
          http_get {
            path = startup_probe.value
            port = 8080
          }
        }
      }
    }
  }

  lifecycle {
    # deploy.yml owns the image, and SECRETS.md names a revision to pick up a new secret value.
    ignore_changes = [client, client_version, template[0].revision, template[0].containers[0].image]
  }

  depends_on = [google_secret_manager_secret_iam_member.access]
}

resource "google_cloud_run_v2_job" "this" {
  for_each = local.jobs

  name     = each.key
  location = local.region

  template {
    template {
      service_account = google_service_account.this[each.value.account].email
      timeout         = each.value.timeout
      max_retries     = each.value.retries

      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = google_compute_network.tamery.name
          subnetwork = google_compute_subnetwork.tamery.name
        }
      }

      containers {
        image   = "${local.registry}/api:bootstrap"
        command = each.value.command
        args    = each.value.args

        resources {
          limits = {
            cpu    = "1000m"
            memory = "1Gi"
          }
        }

        dynamic "env" {
          for_each = each.value.env
          content {
            name  = env.key
            value = env.value
          }
        }

        dynamic "env" {
          for_each = toset(each.value.secrets)
          content {
            name = env.value
            value_source {
              secret_key_ref {
                secret  = env.value
                version = "latest"
              }
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [client, client_version, template[0].template[0].containers[0].image]
  }

  depends_on = [google_secret_manager_secret_iam_member.access]
}

resource "google_cloud_run_v2_job_iam_member" "scheduler_runs_purge" {
  name     = google_cloud_run_v2_job.this["api-purge-deleted-records"].name
  location = local.region
  role     = "roles/run.jobsExecutor"
  member   = google_service_account.this["tamery-scheduler"].member
}

resource "google_cloud_scheduler_job" "purge_deleted_records" {
  name      = "api-purge-deleted-records"
  region    = local.region
  schedule  = "0 3 * * *"
  time_zone = "Etc/UTC"
  paused    = false

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/${google_cloud_run_v2_job.this["api-purge-deleted-records"].id}:run"

    oauth_token {
      service_account_email = google_service_account.this["tamery-scheduler"].email
    }
  }

  depends_on = [google_cloud_run_v2_job_iam_member.scheduler_runs_purge]
}
