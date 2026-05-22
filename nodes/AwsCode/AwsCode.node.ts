import type {
	ICredentialTestFunctions,
	ICredentialsDecrypted,
	IDataObject,
	IExecuteFunctions,
	INodeCredentialTestResult,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { ApplicationError, NodeOperationError } from 'n8n-workflow';

interface AwsCredentials {
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
	region: string;
}

interface AwsConfig {
	region: string;
	credentials: {
		accessKeyId: string;
		secretAccessKey: string;
		sessionToken?: string;
	};
}

interface AwsClientLike {
	destroy(): void;
	send(command: unknown): Promise<unknown>;
}

type SupportedUserModule =
	| 'crypto'
	| 'node:crypto'
	| 'lodash'
	| 'luxon'
	| 'uuid';

declare function require(moduleName: string): unknown;

type AwsSdkModuleName =
	| '@aws-sdk/client-s3'
	| '@aws-sdk/client-bedrock-runtime'
	| '@aws-sdk/client-kms'
	| '@aws-sdk/client-ssm'
	| '@aws-sdk/client-secrets-manager'
	| '@aws-sdk/client-sts';

const supportedUserModules: Record<SupportedUserModule, unknown> = {
	crypto: require('crypto'),
	'node:crypto': require('crypto'),
	lodash: require('lodash'),
	luxon: require('luxon'),
	uuid: require('uuid'),
};

function loadAwsSdkModule<T extends Record<string, unknown>>(
	moduleName: AwsSdkModuleName,
): T {
	return require(moduleName) as T;
}

function getAwsSdkExport<T>(
	moduleName: AwsSdkModuleName,
	exportName: string,
): T {
	const awsModule = loadAwsSdkModule(moduleName);
	const exportedValue = awsModule[exportName];

	if (exportedValue === undefined) {
		throw new ApplicationError(
			`AWS SDK export "${exportName}" is not available from ${moduleName}.`,
		);
	}

	return exportedValue as T;
}

function createLazyAwsClient(
	moduleName: AwsSdkModuleName,
	clientExportName: string,
	awsConfig: AwsConfig,
): { client: AwsClientLike; destroy(): void } {
	let client: AwsClientLike | undefined;

	const getClient = (): AwsClientLike => {
		if (!client) {
			const ClientConstructor = getAwsSdkExport<new (
				config: AwsConfig,
			) => AwsClientLike>(moduleName, clientExportName);
			client = new ClientConstructor(awsConfig);
		}

		return client;
	};

	const clientProxy = new Proxy(
		{},
		{
			get(_target, property) {
				const resolvedClient = getClient() as unknown as Record<
					PropertyKey,
					unknown
				>;
				const value = resolvedClient[property];

				if (typeof value === 'function') {
					return value.bind(resolvedClient);
				}

				return value;
			},
		},
	) as AwsClientLike;

	return {
		client: clientProxy,
		destroy() {
			client?.destroy();
		},
	};
}

function createLazyAwsCommand(
	moduleName: AwsSdkModuleName,
	commandExportName: string,
): new (input: unknown) => unknown {
	return function LazyAwsCommand(input: unknown): unknown {
		const CommandConstructor = getAwsSdkExport<new (
			input: unknown,
		) => unknown>(moduleName, commandExportName);
		return new CommandConstructor(input);
	} as unknown as new (input: unknown) => unknown;
}

function createRestrictedRequire(): (moduleName: string) => unknown {
	return (moduleName: string): unknown => {
		if (!(moduleName in supportedUserModules)) {
			throw new ApplicationError(
				`Module "${moduleName}" is not available. Allowed modules: ${Object.keys(
					supportedUserModules,
				).join(', ')}`,
			);
		}

		return supportedUserModules[moduleName as SupportedUserModule];
	};
}

// Helper function to execute user code with context
async function executeUserCode(
	code: string,
	context: Record<string, unknown>,
): Promise<unknown> {
	// Build the function with all context variables available
	const contextKeys = Object.keys(context);
	const contextValues = Object.values(context);

	// Wrap the code in an async function
	const asyncFunction = new Function(
		...contextKeys,
		`return (async () => {
			${code}
		})();`,
	);

	return asyncFunction(...contextValues);
}

// Helper function to normalize output to INodeExecutionData[]
function normalizeOutput(result: unknown): INodeExecutionData[] {
	if (result === undefined || result === null) {
		return [];
	}

	// If it's already an array
	if (Array.isArray(result)) {
		return result.map((item) => {
			if (typeof item === 'object' && item !== null && 'json' in item) {
				return item as INodeExecutionData;
			}
			return { json: item as IDataObject };
		});
	}

	// If it's a single INodeExecutionData
	if (typeof result === 'object' && result !== null && 'json' in result) {
		return [result as INodeExecutionData];
	}

	// If it's a plain object
	if (typeof result === 'object' && result !== null) {
		return [{ json: result as IDataObject }];
	}

	// For primitive values
	return [{ json: { value: result } as IDataObject }];
}

export class AwsCode implements INodeType {
	methods = {
		credentialTest: {
			async awsCodeCredentialTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const credentials = credential.data as unknown as AwsCredentials;
				const awsConfig: AwsConfig = {
					region: credentials.region,
					credentials: {
						accessKeyId: credentials.accessKeyId,
						secretAccessKey: credentials.secretAccessKey,
						sessionToken: credentials.sessionToken,
					},
				};

				try {
					const { STSClient, GetCallerIdentityCommand } =
						loadAwsSdkModule<typeof import('@aws-sdk/client-sts')>(
							'@aws-sdk/client-sts',
						);
					const stsClient = new STSClient(awsConfig);
					try {
						await stsClient.send(new GetCallerIdentityCommand({}));
					} finally {
						stsClient.destroy();
					}
					return {
						status: 'OK',
						message: 'Connection successful!',
					};
				} catch (error) {
					return {
						status: 'Error',
						message: `Connection failed: ${(error as Error).message}`,
					};
				}
			},
		},
	};

	description: INodeTypeDescription = {
		displayName: 'AWS Code',
		name: 'awsCode',
		icon: { light: 'file:aws.svg', dark: 'file:aws.dark.svg' },
		group: ['transform'],
		version: 1,
		description:
			'Execute custom JavaScript code with AWS SDK v3 clients (S3, Bedrock, KMS, SSM, Secrets Manager)',
		defaults: {
			name: 'AWS Code',
		},
		inputs: ['main'],
		outputs: ['main'],
		usableAsTool: true,
		credentials: [
			{
				name: 'awsSdkV3Api',
				required: true,
				testedBy: 'awsCodeCredentialTest',
			},
		],
		properties: [
			{
				displayName: 'Available Variables',
				name: 'notice',
				type: 'notice',
				default: '',
				description:
					'AWS Clients: $s3, $bedrock, $kms, $ssm, $secretsManager | n8n Variables: $vars | Node.js: require(\'crypto\'), require(\'node:crypto\'), require(\'lodash\'), require(\'luxon\'), require(\'uuid\') | Input Data: $items, $item, $itemIndex | S3: ListBucketsCommand, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, ... | Bedrock: InvokeModelCommand, ConverseCommand, ConverseStreamCommand, ... | KMS: EncryptCommand, DecryptCommand, GenerateDataKeyCommand, DescribeKeyCommand, ListKeysCommand, ... | SSM: GetParameterCommand, PutParameterCommand, GetParametersByPathCommand, ... | Secrets Manager: GetSecretValueCommand, PutSecretValueCommand, CreateSecretCommand, ...',
				},
			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Run Once for All Items',
						value: 'runOnceForAllItems',
						description: 'Run the code once with access to all input items',
					},
					{
						name: 'Run Once for Each Item',
						value: 'runOnceForEachItem',
						description: 'Run the code once for each input item',
					},
				],
				default: 'runOnceForAllItems',
			},
			{
				displayName: 'JavaScript Code',
				name: 'code',
				type: 'string',
				typeOptions: {
					editor: 'jsEditor',
					rows: 20,
				},
				default: `// Available AWS clients (pre-configured with your credentials):
// - $s3: S3Client
// - $bedrock: BedrockRuntimeClient
// - $kms: KMSClient
// - $ssm: SSMClient
// - $secretsManager: SecretsManagerClient
// - $vars: n8n workflow variables
//
// Available Node.js require (whitelisted modules only):
// - const crypto = require('crypto');
// - const crypto = require('node:crypto');
// - const _ = require('lodash');
// - const { DateTime } = require('luxon');
// - const { v4: uuidv4 } = require('uuid');
//
// Available AWS SDK commands:
// - S3: ListBucketsCommand, GetObjectCommand, PutObjectCommand, etc.
// - Bedrock: InvokeModelCommand, ConverseCommand, etc.
// - KMS: EncryptCommand, DecryptCommand, GenerateDataKeyCommand, DescribeKeyCommand, etc.
// - SSM: GetParameterCommand, PutParameterCommand, etc.
// - Secrets Manager: GetSecretValueCommand, PutSecretValueCommand, CreateSecretCommand, etc.
//
// Input data:
// - $items: All input items (in "Run Once for All Items" mode)
// - $item: Current item (in "Run Once for Each Item" mode)
// - $itemIndex: Current item index (in "Run Once for Each Item" mode)
//
// Example - List S3 buckets:
// const response = await $s3.send(new ListBucketsCommand({}));
// return response.Buckets.map(b => ({ json: { name: b.Name } }));

return $items;
`,
				description: 'JavaScript code to execute with access to AWS SDK v3 clients',
				noDataExpression: true,
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const mode = this.getNodeParameter('mode', 0) as string;
		const code = this.getNodeParameter('code', 0) as string;

		// Get AWS credentials
		const credentials = (await this.getCredentials('awsSdkV3Api')) as AwsCredentials;

		// Create AWS SDK v3 configuration
		const awsConfig: AwsConfig = {
			region: credentials.region,
			credentials: {
				accessKeyId: credentials.accessKeyId,
				secretAccessKey: credentials.secretAccessKey,
				sessionToken: credentials.sessionToken,
			},
		};

		// Initialize AWS clients lazily so n8n can load the node even if an
		// unused AWS SDK package has a bad install tree.
		const s3Client = createLazyAwsClient(
			'@aws-sdk/client-s3',
			'S3Client',
			awsConfig,
		);
		const bedrockClient = createLazyAwsClient(
			'@aws-sdk/client-bedrock-runtime',
			'BedrockRuntimeClient',
			awsConfig,
		);
		const kmsClient = createLazyAwsClient(
			'@aws-sdk/client-kms',
			'KMSClient',
			awsConfig,
		);
		const ssmClient = createLazyAwsClient(
			'@aws-sdk/client-ssm',
			'SSMClient',
			awsConfig,
		);
		const secretsManagerClient = createLazyAwsClient(
			'@aws-sdk/client-secrets-manager',
			'SecretsManagerClient',
			awsConfig,
		);

		const createExecutionContext = (itemIndex: number) => {
			const workflowDataProxy = this.getWorkflowDataProxy(itemIndex);

			// Create the execution context with AWS commands and selected n8n variables
			return {
				$s3: s3Client.client,
				$bedrock: bedrockClient.client,
				$kms: kmsClient.client,
				$ssm: ssmClient.client,
				$secretsManager: secretsManagerClient.client,
				$vars: workflowDataProxy.$vars,
				crypto: supportedUserModules.crypto,
				require: createRestrictedRequire(),
				// S3 Commands
				ListBucketsCommand: createLazyAwsCommand(
					'@aws-sdk/client-s3',
					'ListBucketsCommand',
				),
				GetObjectCommand: createLazyAwsCommand(
					'@aws-sdk/client-s3',
					'GetObjectCommand',
				),
				PutObjectCommand: createLazyAwsCommand(
					'@aws-sdk/client-s3',
					'PutObjectCommand',
				),
				DeleteObjectCommand: createLazyAwsCommand(
					'@aws-sdk/client-s3',
					'DeleteObjectCommand',
				),
				CopyObjectCommand: createLazyAwsCommand(
					'@aws-sdk/client-s3',
					'CopyObjectCommand',
				),
				HeadObjectCommand: createLazyAwsCommand(
					'@aws-sdk/client-s3',
					'HeadObjectCommand',
				),
				ListObjectsV2Command: createLazyAwsCommand(
					'@aws-sdk/client-s3',
					'ListObjectsV2Command',
				),
				CreateBucketCommand: createLazyAwsCommand(
					'@aws-sdk/client-s3',
					'CreateBucketCommand',
				),
				DeleteBucketCommand: createLazyAwsCommand(
					'@aws-sdk/client-s3',
					'DeleteBucketCommand',
				),
				// Bedrock Commands
				InvokeModelCommand: createLazyAwsCommand(
					'@aws-sdk/client-bedrock-runtime',
					'InvokeModelCommand',
				),
				InvokeModelWithResponseStreamCommand: createLazyAwsCommand(
					'@aws-sdk/client-bedrock-runtime',
					'InvokeModelWithResponseStreamCommand',
				),
				ConverseCommand: createLazyAwsCommand(
					'@aws-sdk/client-bedrock-runtime',
					'ConverseCommand',
				),
				ConverseStreamCommand: createLazyAwsCommand(
					'@aws-sdk/client-bedrock-runtime',
					'ConverseStreamCommand',
				),
				// KMS Commands
				EncryptCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'EncryptCommand',
				),
				DecryptCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'DecryptCommand',
				),
				ReEncryptCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'ReEncryptCommand',
				),
				GenerateDataKeyCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'GenerateDataKeyCommand',
				),
				GenerateDataKeyWithoutPlaintextCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'GenerateDataKeyWithoutPlaintextCommand',
				),
				GenerateRandomCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'GenerateRandomCommand',
				),
				DescribeKeyCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'DescribeKeyCommand',
				),
				ListKeysCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'ListKeysCommand',
				),
				ListAliasesCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'ListAliasesCommand',
				),
				GetPublicKeyCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'GetPublicKeyCommand',
				),
				SignCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'SignCommand',
				),
				VerifyCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'VerifyCommand',
				),
				GenerateMacCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'GenerateMacCommand',
				),
				VerifyMacCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'VerifyMacCommand',
				),
				CreateKeyCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'CreateKeyCommand',
				),
				CreateAliasCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'CreateAliasCommand',
				),
				UpdateAliasCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'UpdateAliasCommand',
				),
				DeleteAliasCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'DeleteAliasCommand',
				),
				EnableKeyCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'EnableKeyCommand',
				),
				DisableKeyCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'DisableKeyCommand',
				),
				ScheduleKeyDeletionCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'ScheduleKeyDeletionCommand',
				),
				CancelKeyDeletionCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'CancelKeyDeletionCommand',
				),
				TagResourceCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'TagResourceCommand',
				),
				UntagResourceCommand: createLazyAwsCommand(
					'@aws-sdk/client-kms',
					'UntagResourceCommand',
				),
				// SSM Commands
				GetParameterCommand: createLazyAwsCommand(
					'@aws-sdk/client-ssm',
					'GetParameterCommand',
				),
				GetParametersCommand: createLazyAwsCommand(
					'@aws-sdk/client-ssm',
					'GetParametersCommand',
				),
				GetParametersByPathCommand: createLazyAwsCommand(
					'@aws-sdk/client-ssm',
					'GetParametersByPathCommand',
				),
				PutParameterCommand: createLazyAwsCommand(
					'@aws-sdk/client-ssm',
					'PutParameterCommand',
				),
				DeleteParameterCommand: createLazyAwsCommand(
					'@aws-sdk/client-ssm',
					'DeleteParameterCommand',
				),
				DeleteParametersCommand: createLazyAwsCommand(
					'@aws-sdk/client-ssm',
					'DeleteParametersCommand',
				),
				// Secrets Manager Commands
				GetSecretValueCommand: createLazyAwsCommand(
					'@aws-sdk/client-secrets-manager',
					'GetSecretValueCommand',
				),
				BatchGetSecretValueCommand: createLazyAwsCommand(
					'@aws-sdk/client-secrets-manager',
					'BatchGetSecretValueCommand',
				),
				PutSecretValueCommand: createLazyAwsCommand(
					'@aws-sdk/client-secrets-manager',
					'PutSecretValueCommand',
				),
				CreateSecretCommand: createLazyAwsCommand(
					'@aws-sdk/client-secrets-manager',
					'CreateSecretCommand',
				),
				UpdateSecretCommand: createLazyAwsCommand(
					'@aws-sdk/client-secrets-manager',
					'UpdateSecretCommand',
				),
				DeleteSecretCommand: createLazyAwsCommand(
					'@aws-sdk/client-secrets-manager',
					'DeleteSecretCommand',
				),
				DescribeSecretCommand: createLazyAwsCommand(
					'@aws-sdk/client-secrets-manager',
					'DescribeSecretCommand',
				),
				ListSecretsCommand: createLazyAwsCommand(
					'@aws-sdk/client-secrets-manager',
					'ListSecretsCommand',
				),
				RestoreSecretCommand: createLazyAwsCommand(
					'@aws-sdk/client-secrets-manager',
					'RestoreSecretCommand',
				),
			};
		};

		let returnData: INodeExecutionData[] = [];

		try {
			if (mode === 'runOnceForAllItems') {
				// Run once with all items
				const result = await executeUserCode(code, {
					...createExecutionContext(0),
					$items: items,
					$item: items[0],
					$itemIndex: 0,
				});
				returnData = normalizeOutput(result);
			} else {
				// Run once for each item
				for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
					try {
						const result = await executeUserCode(code, {
							...createExecutionContext(itemIndex),
							$items: items,
							$item: items[itemIndex],
							$itemIndex: itemIndex,
						});
						const normalizedResult = normalizeOutput(result);
						returnData.push(...normalizedResult);
					} catch (error) {
						if (this.continueOnFail()) {
							returnData.push({
								json: { error: (error as Error).message },
								pairedItem: { item: itemIndex },
							});
						} else {
							throw new NodeOperationError(this.getNode(), error as Error, {
								itemIndex,
							});
						}
					}
				}
			}
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({
					json: { error: (error as Error).message },
				});
			} else {
				throw new NodeOperationError(this.getNode(), error as Error);
			}
		} finally {
			// Clean up clients
			s3Client.destroy();
			bedrockClient.destroy();
			kmsClient.destroy();
			ssmClient.destroy();
			secretsManagerClient.destroy();
		}

		return [returnData];
	}
}
