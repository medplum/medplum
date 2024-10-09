locals {
  bindings_by_bucket = distinct(flatten([
    for bucket, bindings in var.bucket_bindings
    : [
      flatten([for binding in bindings
        : [
          flatten([for roles, role_name in binding.roles
            : [
              flatten([for members, member_name in binding.members
                : { bucket = bucket, role = role_name, member = member_name }
              ])
            ]
          ])
        ]
      ])
    ]
  ]))
}

resource "google_storage_bucket_iam_member" "bucket_iam_additive" {
  # the format of "${record.bucket}/${record.role}/${record.member}" ensures a unique name
  # for each index in the list. If we use the number based index, adding/deleting
  # roles or members shifts the index and causes resources to be
  # destroyed and recreated, which can cause service disruption while the IAM
  # bindings are temporarily removed and replaced
  for_each = { for idx, record in local.bindings_by_bucket : "${record.bucket}/${record.role}/${record.member}" => record }

  bucket = each.value.bucket
  role   = each.value.role
  member = each.value.member

  depends_on = [module.buckets]
}