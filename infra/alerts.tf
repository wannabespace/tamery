resource "google_monitoring_notification_channel" "email" {
  display_name = "Tamery alerts"
  type         = "email"
  labels       = { email_address = var.alerts_email }
}

# Reads of secrets and uses of the key are not logged without this, and the first two alerts below watch those logs.
resource "google_project_iam_audit_config" "data_reads" {
  for_each = toset(["cloudkms.googleapis.com", "secretmanager.googleapis.com"])

  project = local.project
  service = each.value

  audit_log_config {
    log_type = "DATA_READ"
  }
}

locals {
  admin_activity = "logName:\"cloudaudit.googleapis.com%2Factivity\""

  # Fires on the owner too, on purpose: a stolen owner login is the case that matters most.
  audit_alerts = {
    "Secret read by something other than a service" = "protoPayload.serviceName=\"secretmanager.googleapis.com\" protoPayload.methodName=~\"AccessSecretVersion\" NOT protoPayload.authenticationInfo.principalEmail=~\"^tamery-(api|proxy|jobs)@\""
    "Encryption key used directly"                  = "protoPayload.serviceName=\"cloudkms.googleapis.com\" protoPayload.methodName=~\"Decrypt|Encrypt\" NOT protoPayload.authenticationInfo.principalEmail=~\"@gcp-sa-secretmanager\\.\""
    "Secret or encryption key changed"              = "${local.admin_activity} (protoPayload.serviceName=\"secretmanager.googleapis.com\" OR protoPayload.serviceName=\"cloudkms.googleapis.com\") protoPayload.methodName=~\"AddSecretVersion|Destroy|Disable|Delete|UpdateCryptoKey\""
    "Access rights changed"                         = "${local.admin_activity} protoPayload.methodName=~\"(?i)setIamPolicy|CreateServiceAccount|WorkloadIdentity\""
    "Deploy outside GitHub Actions"                 = "${local.admin_activity} protoPayload.serviceName=\"run.googleapis.com\" protoPayload.methodName=~\"(Service|Job)$\" NOT protoPayload.authenticationInfo.principalEmail=~\"^tamery-(deploy|scheduler)@\""
    "Network or load balancer changed"              = "${local.admin_activity} protoPayload.methodName=~\"(?i)compute\\.(firewalls|networks|subnetworks|routes|addresses|globalAddresses|forwardingRules|globalForwardingRules|targetHttpsProxies|urlMaps|backendServices)\\.|ServerTlsPolicies\""
    "Database or Redis changed or exported"         = "${local.admin_activity} (protoPayload.serviceName=\"sqladmin.googleapis.com\" OR protoPayload.serviceName=\"redis.googleapis.com\") NOT protoPayload.methodName=~\"(?i)\\.(get|list)\""
    "Logging, alerts or an API turned off"          = "${local.admin_activity} protoPayload.methodName=~\"(Delete|Update)(Sink|Exclusion|Bucket)|CreateExclusion|(AlertPolicyService|NotificationChannelService|UptimeCheckService)\\.(Delete|Update)|DisableService\""
  }

  metric_alerts = {
    "Server errors"       = { filter = "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" metric.labels.response_code_class=\"5xx\"", aligner = "ALIGN_RATE", threshold = 0.1 }
    "Rate limit hammered" = { filter = "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" metric.labels.response_code=\"429\"", aligner = "ALIGN_RATE", threshold = 0.5 }
    "Sign-in failures"    = { filter = "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" metric.labels.response_code=\"401\"", aligner = "ALIGN_RATE", threshold = 1 }
    "Job failed"          = { filter = "metric.type=\"run.googleapis.com/job/completed_execution_count\" resource.type=\"cloud_run_job\" metric.labels.result=\"failed\"", aligner = "ALIGN_RATE", threshold = 0 }
    "Too many instances"  = { filter = "metric.type=\"run.googleapis.com/container/instance_count\" resource.type=\"cloud_run_revision\" metric.labels.state=\"active\"", aligner = "ALIGN_MEAN", threshold = 4 }
    "Database CPU"        = { filter = "metric.type=\"cloudsql.googleapis.com/database/cpu/utilization\" resource.type=\"cloudsql_database\"", aligner = "ALIGN_MEAN", threshold = 0.8 }
    "Database memory"     = { filter = "metric.type=\"cloudsql.googleapis.com/database/memory/utilization\" resource.type=\"cloudsql_database\"", aligner = "ALIGN_MEAN", threshold = 0.9 }
    "Database disk"       = { filter = "metric.type=\"cloudsql.googleapis.com/database/disk/utilization\" resource.type=\"cloudsql_database\"", aligner = "ALIGN_MEAN", threshold = 0.8 }
    "Redis memory"        = { filter = "metric.type=\"redis.googleapis.com/stats/memory/usage_ratio\" resource.type=\"redis_instance\"", aligner = "ALIGN_MEAN", threshold = 0.8 }
  }
}

resource "google_monitoring_alert_policy" "audit" {
  for_each = local.audit_alerts

  display_name          = each.key
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = each.key

    condition_matched_log {
      filter = each.value
      label_extractors = {
        who  = "EXTRACT(protoPayload.authenticationInfo.principalEmail)"
        what = "EXTRACT(protoPayload.methodName)"
        from = "EXTRACT(protoPayload.requestMetadata.callerIp)"
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"

    notification_rate_limit {
      period = "300s"
    }
  }

  depends_on = [google_project_iam_audit_config.data_reads]
}

resource "google_monitoring_alert_policy" "metric" {
  for_each = local.metric_alerts

  display_name          = each.key
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = each.key

    condition_threshold {
      filter          = each.value.filter
      comparison      = "COMPARISON_GT"
      threshold_value = each.value.threshold
      duration        = "0s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = each.value.aligner
      }
    }
  }
}

resource "google_monitoring_uptime_check_config" "site" {
  for_each = local.hosts

  display_name = each.value
  timeout      = "10s"
  period       = "300s"

  http_check {
    path         = each.key == "api" ? "/health" : "/"
    port         = 443
    use_ssl      = true
    validate_ssl = true

    # The proxy's / redirects to the website.
    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }
    accepted_response_status_codes {
      status_class = "STATUS_CLASS_3XX"
    }
  }

  monitored_resource {
    type   = "uptime_url"
    labels = { project_id = local.project, host = each.value }
  }
}

resource "google_monitoring_alert_policy" "site_down" {
  display_name          = "Site down"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "Site down"

    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" resource.type=\"uptime_url\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "300s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["metric.labels.check_id"]
      }
    }
  }
}
