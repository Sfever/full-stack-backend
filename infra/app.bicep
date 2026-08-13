targetScope = 'resourceGroup'

param location string = resourceGroup().location
param containerAppName string
param containerEnvironmentName string
param containerImage string
param customDomainCertificateId string = ''
param customDomainName string = ''
param frontendOrigin string
param registryName string
param revisionSuffix string
param siteUrl string
param workloadIdentityName string

@secure()
@description('Restricted runtime PostgreSQL URL. Include sslmode=verify-full.')
param databaseUrl string

@secure()
param sessionSecret string

@secure()
param openRouterApiKey string

param openRouterModel string = 'openrouter/auto'

var customDomainInputsMatch = empty(customDomainName) == empty(customDomainCertificateId)
var customDomains = !customDomainInputsMatch
  ? fail('customDomainName and customDomainCertificateId must either both be set or both be empty.')
  : empty(customDomainName)
    ? []
    : [
      {
        bindingType: 'SniEnabled'
        certificateId: customDomainCertificateId
        name: customDomainName
      }
    ]

@description('Tags applied to the production API.')
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

resource containerApp 'Microsoft.App/containerApps@2025-01-01' = {
  name: containerAppName
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
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        customDomains: customDomains
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      registries: [
        {
          identity: workloadIdentity.id
          server: registry.properties.loginServer
        }
      ]
      secrets: [
        {
          name: 'database-url'
          value: databaseUrl
        }
        {
          name: 'session-secret'
          value: sessionSecret
        }
        {
          name: 'openrouter-api-key'
          value: openRouterApiKey
        }
      ]
    }
    environmentId: containerEnvironment.id
    template: {
      revisionSuffix: revisionSuffix
      terminationGracePeriodSeconds: 15
      containers: [
        {
          name: 'api'
          image: containerImage
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'SESSION_SECRET'
              secretRef: 'session-secret'
            }
            {
              name: 'OPENROUTER_API_KEY'
              secretRef: 'openrouter-api-key'
            }
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'TRUST_PROXY'
              value: 'true'
            }
            {
              name: 'FRONTEND_ORIGIN'
              value: frontendOrigin
            }
            {
              name: 'SITE_URL'
              value: siteUrl
            }
            {
              name: 'OPENROUTER_MODEL'
              value: openRouterModel
            }
            {
              name: 'DB_POOL_MAX'
              value: '5'
            }
            {
              name: 'DB_CONNECTION_TIMEOUT_MS'
              value: '5000'
            }
            {
              name: 'DB_IDLE_TIMEOUT_MS'
              value: '30000'
            }
            {
              name: 'DB_STATEMENT_TIMEOUT_MS'
              value: '10000'
            }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/api/live'
                port: 3000
                scheme: 'HTTP'
              }
              failureThreshold: 20
              initialDelaySeconds: 1
              periodSeconds: 5
              timeoutSeconds: 2
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/ready'
                port: 3000
                scheme: 'HTTP'
              }
              failureThreshold: 3
              initialDelaySeconds: 1
              periodSeconds: 10
              successThreshold: 1
              timeoutSeconds: 3
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/live'
                port: 3000
                scheme: 'HTTP'
              }
              failureThreshold: 3
              initialDelaySeconds: 10
              periodSeconds: 30
              timeoutSeconds: 3
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 2
        rules: [
          {
            name: 'http-concurrency'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
    workloadProfileName: 'Consumption'
  }
}

output containerAppName string = containerApp.name
output defaultHostname string = containerApp.properties.configuration.ingress.fqdn
