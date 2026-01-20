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
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { S3Client } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { SSMClient } from '@aws-sdk/client-ssm';

// Re-export all commands for user code
import * as S3Commands from '@aws-sdk/client-s3';
import * as BedrockCommands from '@aws-sdk/client-bedrock-runtime';
import * as SSMCommands from '@aws-sdk/client-ssm';

interface AwsCredentials {
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
	region: string;
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
				const awsConfig = {
					region: credentials.region,
					credentials: {
						accessKeyId: credentials.accessKeyId,
						secretAccessKey: credentials.secretAccessKey,
						sessionToken: credentials.sessionToken,
					},
				};

				try {
					const s3Client = new S3Client(awsConfig);
					await s3Client.send(new S3Commands.ListBucketsCommand({}));
					s3Client.destroy();
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
		description: 'Execute custom JavaScript code with AWS SDK v3 clients (S3, Bedrock, SSM)',
		defaults: {
			name: 'AWS Code',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
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
				// eslint-disable-next-line n8n-nodes-base/node-param-description-unneeded-backticks
				description: `<strong>AWS Clients:</strong> $s3, $bedrock, $ssm<br/>
<strong>Input Data:</strong> $items, $item, $itemIndex<br/>
<strong>S3:</strong> ListBucketsCommand, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, ...<br/>
<strong>Bedrock:</strong> InvokeModelCommand, ConverseCommand, ConverseStreamCommand, ...<br/>
<strong>SSM:</strong> GetParameterCommand, PutParameterCommand, GetParametersByPathCommand, ...<br/>
<em>Version: 0.1.1</em>`,
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
// - $ssm: SSMClient
//
// Available AWS SDK commands:
// - S3: ListBucketsCommand, GetObjectCommand, PutObjectCommand, etc.
// - Bedrock: InvokeModelCommand, ConverseCommand, etc.
// - SSM: GetParameterCommand, PutParameterCommand, etc.
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
		const awsConfig = {
			region: credentials.region,
			credentials: {
				accessKeyId: credentials.accessKeyId,
				secretAccessKey: credentials.secretAccessKey,
				sessionToken: credentials.sessionToken,
			},
		};

		// Initialize AWS clients
		const s3Client = new S3Client(awsConfig);
		const bedrockClient = new BedrockRuntimeClient(awsConfig);
		const ssmClient = new SSMClient(awsConfig);

		// Create the execution context with all AWS commands available
		const context = {
			$s3: s3Client,
			$bedrock: bedrockClient,
			$ssm: ssmClient,
			// S3 Commands
			ListBucketsCommand: S3Commands.ListBucketsCommand,
			GetObjectCommand: S3Commands.GetObjectCommand,
			PutObjectCommand: S3Commands.PutObjectCommand,
			DeleteObjectCommand: S3Commands.DeleteObjectCommand,
			CopyObjectCommand: S3Commands.CopyObjectCommand,
			HeadObjectCommand: S3Commands.HeadObjectCommand,
			ListObjectsV2Command: S3Commands.ListObjectsV2Command,
			CreateBucketCommand: S3Commands.CreateBucketCommand,
			DeleteBucketCommand: S3Commands.DeleteBucketCommand,
			// Bedrock Commands
			InvokeModelCommand: BedrockCommands.InvokeModelCommand,
			InvokeModelWithResponseStreamCommand: BedrockCommands.InvokeModelWithResponseStreamCommand,
			ConverseCommand: BedrockCommands.ConverseCommand,
			ConverseStreamCommand: BedrockCommands.ConverseStreamCommand,
			// SSM Commands
			GetParameterCommand: SSMCommands.GetParameterCommand,
			GetParametersCommand: SSMCommands.GetParametersCommand,
			GetParametersByPathCommand: SSMCommands.GetParametersByPathCommand,
			PutParameterCommand: SSMCommands.PutParameterCommand,
			DeleteParameterCommand: SSMCommands.DeleteParameterCommand,
			DeleteParametersCommand: SSMCommands.DeleteParametersCommand,
		};

		let returnData: INodeExecutionData[] = [];

		try {
			if (mode === 'runOnceForAllItems') {
				// Run once with all items
				const result = await executeUserCode(code, {
					...context,
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
							...context,
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
			ssmClient.destroy();
		}

		return [returnData];
	}
}
