resource "aws_ses_domain_identity" "medplum" {
  domain = local.ses_domain
}

resource "aws_ses_domain_dkim" "medplum" {
  domain = aws_ses_domain_identity.medplum.domain
}

resource "aws_ses_email_identity" "support" {
  email = var.support_email
}
