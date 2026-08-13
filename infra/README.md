# Azure production deployment

This directory defines one production backend. It intentionally creates no
Azure resources for the `dev` branch.

## Deployment boundary

1. Feature branches enter `dev` through pull requests and run CI only.
2. `dev` enters `main` through a manually merged pull request.
3. A push to `main` runs `.github/workflows/deploy-production.yml`.
4. The workflow builds immutable images, runs the migration job once, and then
   deploys the API revision.

No workflow merges a pull request or pushes to either protected branch.

## Resources

`foundation.bicep` creates the billable, long-lived resources:

- one Basic Azure Container Registry;
- one workload-profile Container Apps environment using Consumption;
- one Burstable B1ms PostgreSQL Flexible Server with 32 GiB storage;
- one production database;
- one VNet with dedicated Container Apps and PostgreSQL subnets;
- one private PostgreSQL DNS zone;
- one Log Analytics workspace with 30-day retention; and
- one user-assigned identity used only to pull images from ACR.

`migration-job.bicep` stores the migration database URL as a Container Apps job
secret. `app.bicep` stores the runtime database URL, session secret, and
OpenRouter key as Container Apps secrets. No Key Vault is created.

PostgreSQL public access and high availability are disabled. Storage auto-grow
is also disabled to avoid an unplanned increase in provisioned storage. Monitor
free space and deliberately resize before the database fills.

The custom VNet is required for private PostgreSQL access. Microsoft notes that
Container Apps creates additional managed resources for custom-network
environments and that those resources can incur charges. Treat the B1ms server,
Basic registry, Log Analytics ingestion, storage, and networking as billable;
the repository does not claim this foundation is permanently free.

## Inputs that must be confirmed

Do not deploy the foundation until these values are explicitly selected:

- Azure subscription;
- Azure region and resource-group name;
- short resource prefix;
- PostgreSQL administrator login and generated password;
- exact production frontend origin and public site URL; and
- the production API custom domain, if one will be bound.

The PostgreSQL password and all application secrets must stay out of this
repository and shell history. Pass secrets through environment variables or
interactive secret prompts.

## One-time foundation deployment

The operator must have permission to create resources and role assignments.
Register the required Azure resource providers, create the resource group, and
deploy `foundation.bicep`. The deployment identity object ID is optional on the
first run and can be added after GitHub OIDC is created.

Example shape, with values deliberately left as placeholders:

```bash
az group create \
  --name <resource-group> \
  --location <region>

az deployment group create \
  --resource-group <resource-group> \
  --template-file infra/foundation.bicep \
  --parameters \
    resourcePrefix=<prefix> \
    postgresAdministratorLogin=<admin-login> \
    postgresAdministratorPassword="$POSTGRES_ADMIN_PASSWORD" \
    deploymentPrincipalObjectId=<github-identity-object-id>
```

Review the deployment output for the generated registry, PostgreSQL,
environment, and workload-identity names. These exact values become GitHub
configuration; do not reconstruct or guess them.

## GitHub production configuration

Create a GitHub environment named `production`. It does not need a required
reviewer because this repository has one maintainer. Restrict its deployment
branch to `main`.

Configure these environment or repository variables:

- `AZURE_CLIENT_ID`
- `AZURE_CONTAINER_APP_NAME`
- `AZURE_CONTAINER_ENVIRONMENT_NAME`
- `AZURE_MIGRATION_JOB_NAME`
- `AZURE_REGISTRY_NAME`
- `AZURE_RESOURCE_GROUP`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_TENANT_ID`
- `AZURE_WORKLOAD_IDENTITY_NAME`
- `FRONTEND_ORIGIN`
- `SITE_URL`

Configure these GitHub Actions secrets:

- `PRODUCTION_DATABASE_URL`
- `PRODUCTION_MIGRATION_DATABASE_URL`
- `PRODUCTION_OPENROUTER_API_KEY`
- `PRODUCTION_SESSION_SECRET`

Both PostgreSQL URLs must include `sslmode=verify-full`, target the same server
and database, and use different roles. The migration URL owns the schema. On
every deployment, the migration job creates or rotates the runtime role from the
runtime URL, removes administrative capabilities, applies migrations, and then
grants only database connect, schema usage, table DML, and sequence usage. The
runtime role cannot modify the migration ledger.

The Entra federated credential must trust this repository's `production`
environment subject. The corresponding service principal needs Contributor on
the production resource group and AcrPush on the registry. The foundation
template creates both assignments when `deploymentPrincipalObjectId` is
provided.

## Custom API domain

The initial workflow verifies the default `azurecontainerapps.io` hostname.
Bind the final `api.<domain>` hostname only after the Container App exists and
the exact Cloudflare zone is confirmed. Keep the validation DNS record DNS-only
until Azure issues the managed certificate, then set `VITE_API_URL` on the
frontend to that HTTPS origin.

## Database changes

Every table or column change is a numbered `node-pg-migrate` migration. CI
applies all migrations to a fresh PostgreSQL 16 service. Production applies
pending migrations in a single Container Apps Job before deploying the API.
Breaking changes must use expand-and-contract migrations so the previous API
revision remains compatible during rollback.
