# ---------------------------------------------------------------------------
# Makefile - medplum-video infrastructure (LiveKit + Test-Harness)
#
# Prerequisites
#   - AWS CLI v2  configured with credentials for the target account
#   - Terraform >= 1.14
#   - Docker (for building wrapper images)
#
# Parameters (all optional)
#
#   MODULE=<livekit|test-harness>  Which TF module to operate on.
#                                  Default: livekit.
#
#   ENV=<name>      Load terraform.tfvars.<name> as the var file for the
#                   selected module.  If a base terraform.tfvars also
#                   exists it is loaded first; the env file overrides it.
#
#   PROFILE=<name>  AWS CLI / provider profile to use for every aws and
#                   terraform command.  Equivalent to setting AWS_PROFILE.
#
# Examples
#   make plan   MODULE=livekit       ENV=dev
#   make setup  MODULE=livekit       ENV=dev PROFILE=medplum
#   make setup  MODULE=test-harness  ENV=dev PROFILE=medplum
#   make apply  MODULE=test-harness  ENV=dev PROFILE=medplum
#   make apply                                           # base tfvars, default AWS creds
# ---------------------------------------------------------------------------

SHELL           := /bin/bash

# ---------------------------------------------------------------------------
# MODULE selection -> resolves TF_DIR, DOCKER_DIR, IMAGE_NAME, role names, etc.
# ---------------------------------------------------------------------------

MODULE          ?= livekit

ifeq ($(MODULE),livekit)
  TF_DIR         := terraform/livekit
  DOCKER_DIR     := livekit-server
  DOCKERFILE     := $(DOCKER_DIR)/Dockerfile
  DOCKER_CONTEXT := $(DOCKER_DIR)
  IMAGE_NAME     := livekit-server
  _MODULE_SUFFIX := livekit
else ifeq ($(MODULE),test-harness)
  TF_DIR         := terraform/test-harness
  DOCKER_DIR     := test-harness
  DOCKERFILE     := $(DOCKER_DIR)/Dockerfile
  # The test-harness image builds from the repo subdirectory so its Vite
  # build can reach packages/react and packages/test-harness source.
  DOCKER_CONTEXT := ..
  IMAGE_NAME     := medplum-video-test-harness
  _MODULE_SUFFIX := test-harness
else
  $(error MODULE must be one of: livekit | test-harness (got '$(MODULE)'))
endif

_MODULE_LABEL := [MODULE=$(MODULE)]

# ---------------------------------------------------------------------------
# AWS profile
# ---------------------------------------------------------------------------

ifdef PROFILE
  export AWS_PROFILE := $(PROFILE)
  _PROFILE_LABEL     := [PROFILE=$(PROFILE)]
else
  _PROFILE_LABEL     :=
endif

# ---------------------------------------------------------------------------
# ENV-aware var-file flags
#
# Resolution order:
#   1. terraform.tfvars          (base, if it exists)
#   2. terraform.tfvars.<ENV>    (override, required when ENV is set)
# ---------------------------------------------------------------------------

ifdef ENV
  TFVARS_ENV_FILE  := terraform.tfvars.$(ENV)
  TFVARS_BASE_FILE := terraform.tfvars

  _BASE_FLAG  := $(if $(wildcard $(TF_DIR)/$(TFVARS_BASE_FILE)),-var-file=$(TFVARS_BASE_FILE),)
  TF_VAR_FLAGS := $(_BASE_FLAG) -var-file=$(TFVARS_ENV_FILE)
  _ENV_LABEL   := [ENV=$(ENV)]
else
  TF_VAR_FLAGS :=
  _ENV_LABEL   :=
endif

_LABEL := $(_MODULE_LABEL) $(_ENV_LABEL) $(_PROFILE_LABEL)

# ---------------------------------------------------------------------------
# AWS helpers (populated from Terraform output after first apply)
# ---------------------------------------------------------------------------

ECR_REPO       ?= $(shell cd $(TF_DIR) && terraform output -raw ecr_repository_url 2>/dev/null)
AWS_REGION     ?= $(shell cd $(TF_DIR) && terraform output -raw aws_region 2>/dev/null || echo "us-east-1")
AWS_ACCOUNT_ID ?= $(shell aws sts get-caller-identity --query Account --output text 2>/dev/null)

.PHONY: help bootstrap iam-bootstrap init plan apply destroy push-image ecr-login setup force-deploy

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  Optional params:  MODULE=<livekit|test-harness>  ENV=<name>  PROFILE=<aws-profile>"
	@echo "  Examples:"
	@echo "    make setup MODULE=livekit      ENV=dev PROFILE=medplum"
	@echo "    make setup MODULE=test-harness ENV=dev PROFILE=medplum"

# ---------------------------------------------------------------------------
# Bootstrap - create S3 bucket + DynamoDB lock table
# (both modules share the same backend bucket/table; run once per AWS account)
# ---------------------------------------------------------------------------

TF_BACKEND_BUCKET := $(shell grep 'bucket' $(TF_DIR)/main.tf | head -1 | sed 's/.*= *"\(.*\)".*/\1/')
TF_BACKEND_REGION := $(shell grep 'region' $(TF_DIR)/main.tf | head -1 | sed 's/.*= *"\(.*\)".*/\1/')
TF_BACKEND_TABLE  := $(shell grep 'dynamodb_table' $(TF_DIR)/main.tf | head -1 | sed 's/.*= *"\(.*\)".*/\1/')

_AWS_PROFILE_FLAG := $(if $(PROFILE),--profile $(PROFILE),)

bootstrap: ## Create S3 state bucket + DynamoDB lock table (run once before setup)
	@echo "==> Bootstrapping remote state $(_PROFILE_LABEL)"
	@echo "    bucket : $(TF_BACKEND_BUCKET)"
	@echo "    region : $(TF_BACKEND_REGION)"
	@echo "    table  : $(TF_BACKEND_TABLE)"
	@echo ""
	@if aws s3api head-bucket --bucket $(TF_BACKEND_BUCKET) --region $(TF_BACKEND_REGION) $(_AWS_PROFILE_FLAG) 2>/dev/null; then \
	  echo "  [skip] S3 bucket already exists: $(TF_BACKEND_BUCKET)"; \
	else \
	  echo "  [create] S3 bucket: $(TF_BACKEND_BUCKET)"; \
	  if [ "$(TF_BACKEND_REGION)" = "us-east-1" ]; then \
	    aws s3api create-bucket \
	      --bucket $(TF_BACKEND_BUCKET) \
	      --region $(TF_BACKEND_REGION) $(_AWS_PROFILE_FLAG); \
	  else \
	    aws s3api create-bucket \
	      --bucket $(TF_BACKEND_BUCKET) \
	      --region $(TF_BACKEND_REGION) \
	      --create-bucket-configuration LocationConstraint=$(TF_BACKEND_REGION) $(_AWS_PROFILE_FLAG); \
	  fi; \
	  aws s3api put-bucket-versioning \
	    --bucket $(TF_BACKEND_BUCKET) \
	    --versioning-configuration Status=Enabled $(_AWS_PROFILE_FLAG); \
	  aws s3api put-bucket-encryption \
	    --bucket $(TF_BACKEND_BUCKET) \
	    --server-side-encryption-configuration \
	      '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' $(_AWS_PROFILE_FLAG); \
	  aws s3api put-public-access-block \
	    --bucket $(TF_BACKEND_BUCKET) \
	    --public-access-block-configuration \
	      "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" $(_AWS_PROFILE_FLAG); \
	  echo "  [ok] S3 bucket created and hardened"; \
	fi
	@if aws dynamodb describe-table --table-name $(TF_BACKEND_TABLE) --region $(TF_BACKEND_REGION) $(_AWS_PROFILE_FLAG) 2>/dev/null | grep -q '"TableStatus"'; then \
	  echo "  [skip] DynamoDB table already exists: $(TF_BACKEND_TABLE)"; \
	else \
	  echo "  [create] DynamoDB table: $(TF_BACKEND_TABLE)"; \
	  aws dynamodb create-table \
	    --table-name $(TF_BACKEND_TABLE) \
	    --region $(TF_BACKEND_REGION) \
	    --attribute-definitions AttributeName=LockID,AttributeType=S \
	    --key-schema AttributeName=LockID,KeyType=HASH \
	    --billing-mode PAY_PER_REQUEST $(_AWS_PROFILE_FLAG); \
	  aws dynamodb wait table-exists \
	    --table-name $(TF_BACKEND_TABLE) \
	    --region $(TF_BACKEND_REGION) $(_AWS_PROFILE_FLAG); \
	  echo "  [ok] DynamoDB table ready"; \
	fi
	@echo ""
	@echo "==> Bootstrap complete."

# ---------------------------------------------------------------------------
# Terraform targets
# ---------------------------------------------------------------------------

init: ## Initialise Terraform (download providers, configure backend)
	cd $(TF_DIR) && terraform init -migrate-state

plan: init ## Preview changes without applying
	@echo "==> terraform plan $(_LABEL)"
	@$(if $(ENV), \
	  test -f $(TF_DIR)/$(TFVARS_ENV_FILE) || \
	    { echo "ERROR: $(TF_DIR)/$(TFVARS_ENV_FILE) not found"; exit 1; })
	cd $(TF_DIR) && terraform plan $(TF_VAR_FLAGS)

apply: init ## Apply all Terraform changes
	@echo "==> terraform apply $(_LABEL)"
	@$(if $(ENV), \
	  test -f $(TF_DIR)/$(TFVARS_ENV_FILE) || \
	    { echo "ERROR: $(TF_DIR)/$(TFVARS_ENV_FILE) not found"; exit 1; })
	cd $(TF_DIR) && terraform apply -auto-approve $(TF_VAR_FLAGS)

destroy: ## Destroy all resources (DESTRUCTIVE)
	@echo "==> terraform destroy $(_LABEL)"
	cd $(TF_DIR) && terraform destroy $(TF_VAR_FLAGS)

# ---------------------------------------------------------------------------
# Docker image targets
# ---------------------------------------------------------------------------

ecr-login: ## Authenticate Docker to ECR
	aws ecr get-login-password --region $(AWS_REGION) | \
	  docker login --username AWS --password-stdin $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com

push-image: ecr-login ## Build and push the container image to ECR
	@if [ -z "$(ECR_REPO)" ]; then \
	  echo "ECR_REPO is empty - run 'make apply' first to create the ECR repository."; \
	  exit 1; \
	fi
	docker build --platform linux/amd64 -f $(DOCKERFILE) -t $(IMAGE_NAME) $(DOCKER_CONTEXT)
	docker tag $(IMAGE_NAME):latest $(ECR_REPO):latest
	docker tag $(IMAGE_NAME):latest $(ECR_REPO):$(shell date +%Y%m%d-%H%M%S)
	docker push $(ECR_REPO):latest
	@echo "Pushed: $(ECR_REPO):latest"

# ---------------------------------------------------------------------------
# IAM bootstrap - create ECS task roles via AWS CLI
#
# The SSO credential set lacks iam:TagRole / iam:ListRolePolicies which the
# Terraform AWS provider calls on every aws_iam_role cycle.  Create roles
# outside Terraform so they can be referenced as read-only data sources.
# ---------------------------------------------------------------------------

_ENV_PREFIX    := $(if $(ENV),$(ENV),production)
_ROLE_EXEC     := $(_ENV_PREFIX)-$(_MODULE_SUFFIX)-task-execution
_ROLE_TASK     := $(_ENV_PREFIX)-$(_MODULE_SUFFIX)-task
_AWS_ACCOUNT   := $(shell aws sts get-caller-identity --query Account --output text $(_AWS_PROFILE_FLAG) 2>/dev/null)

_TRUST_POLICY  := '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

iam-bootstrap: ## Pre-create ECS IAM roles via AWS CLI (run once per MODULE+ENV)
	@echo "==> Creating IAM roles $(_PROFILE_LABEL) [module=$(MODULE) env=$(_ENV_PREFIX)]"
	@if aws iam get-role --role-name $(_ROLE_EXEC) $(_AWS_PROFILE_FLAG) 2>/dev/null | grep -q RoleName; then \
	  echo "  [skip] role already exists: $(_ROLE_EXEC)"; \
	else \
	  echo "  [create] $(_ROLE_EXEC)"; \
	  aws iam create-role \
	    --role-name $(_ROLE_EXEC) \
	    --assume-role-policy-document $(_TRUST_POLICY) \
	    --description "ECS task execution role for $(MODULE) ($(_ENV_PREFIX))" \
	    $(_AWS_PROFILE_FLAG); \
	fi
	@echo "  [attach] AmazonECSTaskExecutionRolePolicy"
	@aws iam attach-role-policy \
	  --role-name $(_ROLE_EXEC) \
	  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy \
	  $(_AWS_PROFILE_FLAG) 2>/dev/null || true
	@echo "  [attach] AmazonSSMReadOnlyAccess"
	@aws iam attach-role-policy \
	  --role-name $(_ROLE_EXEC) \
	  --policy-arn arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess \
	  $(_AWS_PROFILE_FLAG) 2>/dev/null || true
	@if aws iam get-role --role-name $(_ROLE_TASK) $(_AWS_PROFILE_FLAG) 2>/dev/null | grep -q RoleName; then \
	  echo "  [skip] role already exists: $(_ROLE_TASK)"; \
	else \
	  echo "  [create] $(_ROLE_TASK)"; \
	  aws iam create-role \
	    --role-name $(_ROLE_TASK) \
	    --assume-role-policy-document $(_TRUST_POLICY) \
	    --description "ECS task role for $(MODULE) container ($(_ENV_PREFIX))" \
	    $(_AWS_PROFILE_FLAG); \
	fi
	@echo "  [attach] CloudWatchLogsFullAccess"
	@aws iam attach-role-policy \
	  --role-name $(_ROLE_TASK) \
	  --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess \
	  $(_AWS_PROFILE_FLAG) 2>/dev/null || true
	@echo ""
	@echo "==> IAM roles ready."

setup: ## First-time deploy: IAM bootstrap -> ECR -> push image -> deploy everything
	@echo "==> Step 0/4  Bootstrap IAM roles $(_LABEL)"
	$(MAKE) iam-bootstrap MODULE=$(MODULE) ENV=$(ENV) PROFILE=$(PROFILE)
	@echo "==> Step 1/4  Create ECR repository $(_LABEL)"
	@$(if $(ENV), \
	  test -f $(TF_DIR)/$(TFVARS_ENV_FILE) || \
	    { echo "ERROR: $(TF_DIR)/$(TFVARS_ENV_FILE) not found"; exit 1; })
	cd $(TF_DIR) && terraform init && \
	  terraform apply -target=$(if $(filter livekit,$(MODULE)),aws_ecr_repository.livekit,aws_ecr_repository.test_harness) -auto-approve $(TF_VAR_FLAGS)
	@echo "==> Step 2/4  Build and push image"
	$(MAKE) push-image MODULE=$(MODULE) ENV=$(ENV) PROFILE=$(PROFILE)
	@echo "==> Step 3/4  Deploy remaining infrastructure"
	$(MAKE) apply MODULE=$(MODULE) ENV=$(ENV) PROFILE=$(PROFILE)
	@echo ""
	@echo "==> Done! Outputs:"
	@echo "    cd $(TF_DIR) && terraform output"

force-deploy: ## Force a new ECS task deployment (pick up a new :latest image)
	@CLUSTER=$$(cd $(TF_DIR) && terraform output -raw ecs_cluster_name 2>/dev/null) && \
	 SERVICE=$$(cd $(TF_DIR) && terraform output -raw ecs_service_name 2>/dev/null) && \
	 aws ecs update-service \
	   --cluster "$$CLUSTER" \
	   --service "$$SERVICE" \
	   --force-new-deployment \
	   --region $(AWS_REGION) \
	   --output text --query 'service.serviceName' $(_AWS_PROFILE_FLAG)
	@echo "New deployment started."
