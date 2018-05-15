# firecloud-bucket-log-shipper
> A quick Cloud Function to send bucket audit logs from Google to Logit.

* [Objective](#objective)
* [High Level Architecture](#high-level-architecture)
* [Handling the API Key](#handling-the-api-key)
* [Deployment](#deployment)
* [Viewing the Cloud Function](#viewing-the-cloud-function)
* [Developer Guidance](#developer-guidance)

## Objective
In order to analyze user metrics on reads and writes of data in Google buckets, we send records of those reads and writes to an Elasticsearch/Logstash/Kibana stack.

## High Level Architecture

```
Audit Logging -> Stackdriver -> Pub/Sub -> Cloud Function -> Logit
```

We have enabled [Cloud Storage Audit Logging](https://cloud.google.com/storage/docs/audit-logs) for buckets within the FireCloud organization. By default, these logs write to Stackdriver; we then [sink](https://cloud.google.com/logging/docs/export/configure_export_v2) the logs from Stackdriver to a Pub/Sub channel.

This Cloud Function triggers on messages to the Pub/Sub channel. Each message contains a single audit log entry; the Cloud Function reads the log entry, extracts relevant details, and ships the details to Logit.

## Handling the API Key

This Cloud Function requires a Logit API key in order to send logs to Logit. This API key is read, at runtime, from a secured bucket. When the function is triggered, if its `logitApiKey` variable is null, it will read the value from the secured bucket and cache its value for later invocations. The Logit API key is secured using bucket ACLs.

Due to the multi-threaded and elastic nature of Cloud Functions, when new code is deployed this can result in many requests to the bucket in a relatively short period of time. It's always worthwhile to monitor new deployments to ensure they are successful.

## Deployment

This Cloud Function currently runs only in the FireCloud production environment.

Deployment is currently manual. To deploy updates:
1. Ensure you have proper permissions.
2. Check out this repository.
3. `cd` into the directory containing the code.
4. execute `gcloud beta functions --account ${YOUR-PROD-ACCOUNT} --project firecloud-log-export deploy metricsLogShipper_v2 --trigger-resource log_aggregate --trigger-event google.pubsub.topic.publish --entry-point metricsLogShipper`

## Viewing the Cloud Function
You can view the Cloud Function in Google Cloud Console, assuming you have the proper permissions. Naviate to the `firecloud-log-export` project, then Cloud Functions, and look for the function named `metricsLogShipper_v2`. From here, you can follow links to read its logs or perform other maintenance and monitoring tasks.

## Developer Guidance

Before contributing code to this repository, make sure you have read:
* https://cloud.google.com/functions/docs/bestpractices/tips
* https://cloud.google.com/functions/docs/bestpractices/networking