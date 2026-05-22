# n8n-nodes-aws-sdk-v3

This is an n8n community node that allows you to execute custom JavaScript code with pre-configured AWS SDK v3 clients (S3, Bedrock, KMS, SSM, Secrets Manager) in your n8n workflows.

**Note:** This node uses external dependencies (AWS SDK v3) and is only compatible with self-hosted n8n installations. It cannot be used on n8n Cloud.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)  
[Compatibility](#compatibility)  
[Usage](#usage)  
[Resources](#resources)  
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

```bash
npm install n8n-nodes-aws-sdk-v3
```

Or install it directly in your n8n instance via the Community Nodes settings.

## Operations

The **AWS Code** node provides a code editor where you can write custom JavaScript code with access to:

### Pre-configured AWS Clients

- `$s3` - Amazon S3 Client
- `$bedrock` - Amazon Bedrock Runtime Client
- `$kms` - AWS Key Management Service (KMS) Client
- `$ssm` - AWS Systems Manager (SSM) Client
- `$secretsManager` - AWS Secrets Manager Client

### Available AWS SDK Commands

**S3 Commands:**
- `ListBucketsCommand`
- `GetObjectCommand`
- `PutObjectCommand`
- `DeleteObjectCommand`
- `CopyObjectCommand`
- `HeadObjectCommand`
- `ListObjectsV2Command`
- `CreateBucketCommand`
- `DeleteBucketCommand`

**Bedrock Commands:**
- `InvokeModelCommand`
- `InvokeModelWithResponseStreamCommand`
- `ConverseCommand`
- `ConverseStreamCommand`

**KMS Commands:**
- `EncryptCommand`
- `DecryptCommand`
- `ReEncryptCommand`
- `GenerateDataKeyCommand`
- `GenerateDataKeyWithoutPlaintextCommand`
- `GenerateRandomCommand`
- `DescribeKeyCommand`
- `ListKeysCommand`
- `ListAliasesCommand`
- `GetPublicKeyCommand`
- `SignCommand`
- `VerifyCommand`
- `GenerateMacCommand`
- `VerifyMacCommand`
- `CreateKeyCommand`
- `CreateAliasCommand`
- `UpdateAliasCommand`
- `DeleteAliasCommand`
- `EnableKeyCommand`
- `DisableKeyCommand`
- `ScheduleKeyDeletionCommand`
- `CancelKeyDeletionCommand`
- `TagResourceCommand`
- `UntagResourceCommand`

**SSM Commands:**
- `GetParameterCommand`
- `GetParametersCommand`
- `GetParametersByPathCommand`
- `PutParameterCommand`
- `DeleteParameterCommand`
- `DeleteParametersCommand`

**Secrets Manager Commands:**
- `GetSecretValueCommand`
- `BatchGetSecretValueCommand`
- `PutSecretValueCommand`
- `CreateSecretCommand`
- `UpdateSecretCommand`
- `DeleteSecretCommand`
- `DescribeSecretCommand`
- `ListSecretsCommand`
- `RestoreSecretCommand`

### Execution Modes

- **Run Once for All Items** - Execute the code once with access to all input items via `$items`
- **Run Once for Each Item** - Execute the code once for each input item via `$item`

## Credentials

Create **AWS SDK V3 API** credentials with:

| Field | Description |
|-------|-------------|
| Access Key ID | Your AWS Access Key ID |
| Secret Access Key | Your AWS Secret Access Key |
| Region | AWS region (e.g., `eu-west-1`, `us-east-1`) |
| Session Token | Optional - for temporary credentials (STS) |

Credential testing uses AWS STS `GetCallerIdentity`, so credentials can validate even without S3-specific permissions.

## Compatibility

- Requires n8n version 1.0.0 or later
- **Self-hosted n8n only** - Not compatible with n8n Cloud

## Usage

### Example: List S3 Buckets

```javascript
const response = await $s3.send(new ListBucketsCommand({}));
return response.Buckets.map(b => ({ json: { name: b.Name } }));
```

### Example: Get SSM Parameter

```javascript
const response = await $ssm.send(new GetParameterCommand({
  Name: '/my/parameter/path',
  WithDecryption: true
}));
return [{ json: { value: response.Parameter.Value } }];
```

### Example: Invoke Bedrock Model (Claude)

```javascript
const response = await $bedrock.send(new ConverseCommand({
  modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
  messages: [
    {
      role: 'user',
      content: [{ text: $item.json.prompt }]
    }
  ]
}));

return [{
  json: {
    response: response.output.message.content[0].text
  }
}];
```

### Example: Get a Secret Value

```javascript
const response = await $secretsManager.send(new GetSecretValueCommand({
  SecretId: 'my/app/secret',
}));

if (response.SecretString) {
  return [{ json: { secret: response.SecretString } }];
}

const secretBinaryBase64 = Buffer.from(response.SecretBinary).toString('base64');
return [{ json: { secretBinaryBase64 } }];
```

### Example: Encrypt Data with KMS

```javascript
const plaintext = Buffer.from($item.json.value, 'utf8');

const response = await $kms.send(new EncryptCommand({
  KeyId: $vars.KMS_KEY_ID,
  Plaintext: plaintext,
}));

return [{
  json: {
    ciphertextBase64: Buffer.from(response.CiphertextBlob).toString('base64'),
  }
}];
```

### Example: Upload to S3

```javascript
const response = await $s3.send(new PutObjectCommand({
  Bucket: 'my-bucket',
  Key: `files/${$item.json.filename}`,
  Body: $item.json.content,
  ContentType: 'text/plain'
}));

return [{ json: { success: true, etag: response.ETag } }];
```

### Example: Use Built-in Helper Libraries

The AWS Code node exposes a restricted `require()` with these allowed modules:

- `crypto`
- `node:crypto`
- `lodash`
- `luxon`
- `uuid`

```javascript
const crypto = require('crypto');
const _ = require('lodash');
const { DateTime } = require('luxon');
const { v4: uuidv4 } = require('uuid');

const payload = {
  userId: $item.json.userId,
  email: $item.json.email,
  roles: $item.json.roles ?? [],
};

const normalizedPayload = _.pick(payload, ['userId', 'email', 'roles']);
const digest = crypto
  .createHash('sha256')
  .update(JSON.stringify(normalizedPayload))
  .digest('hex');

return [{
  json: {
    id: uuidv4(),
    processedAt: DateTime.now().toISO(),
    digest,
    roleCount: _.size(normalizedPayload.roles),
  }
}];
```

### Example: Use n8n Workflow Variables

```javascript
const bucketName = $vars.AWS_BUCKET_NAME;
const environment = $vars.APP_ENV ?? 'dev';

return [{
  json: {
    bucketName,
    environment,
  }
}];
```

### Available Variables

| Variable | Description |
|----------|-------------|
| `$s3` | Pre-configured S3Client |
| `$bedrock` | Pre-configured BedrockRuntimeClient |
| `$kms` | Pre-configured KMSClient |
| `$ssm` | Pre-configured SSMClient |
| `$secretsManager` | Pre-configured SecretsManagerClient |
| `$vars` | n8n workflow variables |
| `require` | Restricted `require()` for allowed modules (`crypto`, `node:crypto`, `lodash`, `luxon`, `uuid`) |
| `crypto` | Shortcut to the Node.js crypto module |
| `$items` | All input items (array) |
| `$item` | Current item (in "Run Once for Each Item" mode) |
| `$itemIndex` | Current item index |

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [AWS SDK for JavaScript v3 Documentation](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/)
- [Amazon S3 Documentation](https://docs.aws.amazon.com/s3/)
- [Amazon Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [AWS Key Management Service Documentation](https://docs.aws.amazon.com/kms/)
- [AWS Systems Manager Documentation](https://docs.aws.amazon.com/systems-manager/)
- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)

## Version history

### Unreleased

- Added AWS KMS client support (`$kms`)
- Added key KMS commands to the runtime context
- Added AWS Secrets Manager client support (`$secretsManager`)
- Added key Secrets Manager commands to the runtime context
- Added `$vars` support for n8n workflow variables
- Added restricted `require()` support for `crypto`, `lodash`, `luxon`, and `uuid`
- Updated credentials test to use STS `GetCallerIdentity`

### 0.1.0

- Initial release
- AWS Code node with S3, Bedrock, and SSM support
- Custom credentials for AWS SDK v3
