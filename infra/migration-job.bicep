targetScope = 'resourceGroup'

param location string = resourceGroup().location
param containerEnvironmentName string
param migrationJobName string
param migrationImage string
param registryName string
param workloadIdentityName string

@secure()
@description('PostgreSQL owner connection URL. Include sslmode=verify-full.')
param migrationDatabaseUrl string

@secure()
@description('Restricted API connection URL. Include sslmode=verify-full.')
param runtimeDatabaseUrl string

@description('Tags applied to the migration job.')
param tags object = {
  application: 'video-forge'
  environment: 'production'
  managedBy: 'bicep'
}

resource containerEnvironment 'Microsoft.App/managedEnvironments@2025-01-01' existing = {
  name: containerEnvironmentName
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource workloadIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: workloadIdentityName
}

resource migrationJob 'Microsoft.App/jobs@2025-01-01' = {
  name: migrationJobName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${workloadIdentity.id}': {}
    }
  }
  properties: {
    configuration: {
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: [
        {
          identity: workloadIdentity.id
          server: registry.properties.loginServer
        }
      ]
      replicaRetryLimit: 0
      replicaTimeout: 600
      secrets: [
        {
          name: 'migration-database-url'
          value: migrationDatabaseUrl
        }
        {
          name: 'runtime-database-url'
          value: runtimeDatabaseUrl
        }
      ]
      triggerType: 'Manual'
    }
    environmentId: containerEnvironment.id
    template: {
      containers: [
        {
          name: 'migrations'
          image: migrationImage
          env: [
            {
              name: 'MIGRATION_DATABASE_URL'
              secretRef: 'migration-database-url'
            }
            {
              name: 'RUNTIME_DATABASE_URL'
              secretRef: 'runtime-database-url'
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
    }
    workloadProfileName: 'Consumption'
  }
}

output migrationJobName string = migrationJob.name
