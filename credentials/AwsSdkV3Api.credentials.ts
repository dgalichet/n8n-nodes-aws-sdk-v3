import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class AwsSdkV3Api implements ICredentialType {
	name = 'awsSdkV3Api';
	displayName = 'AWS SDK V3 API';
	documentationUrl = 'https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/';
	icon = { light: 'file:aws.svg', dark: 'file:aws.dark.svg' } as const;
	properties: INodeProperties[] = [
		{
			displayName: 'Access Key ID',
			name: 'accessKeyId',
			type: 'string',
			default: '',
			required: true,
			description: 'The AWS Access Key ID',
		},
		{
			displayName: 'Secret Access Key',
			name: 'secretAccessKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'The AWS Secret Access Key',
		},
		{
			displayName: 'Region',
			name: 'region',
			type: 'options',
			options: [
				{ name: 'Africa (Cape Town) - af-south-1', value: 'af-south-1' },
				{ name: 'Asia Pacific (Hong Kong) - ap-east-1', value: 'ap-east-1' },
				{ name: 'Asia Pacific (Mumbai) - ap-south-1', value: 'ap-south-1' },
				{ name: 'Asia Pacific (Hyderabad) - ap-south-2', value: 'ap-south-2' },
				{ name: 'Asia Pacific (Osaka) - ap-northeast-3', value: 'ap-northeast-3' },
				{ name: 'Asia Pacific (Seoul) - ap-northeast-2', value: 'ap-northeast-2' },
				{ name: 'Asia Pacific (Singapore) - ap-southeast-1', value: 'ap-southeast-1' },
				{ name: 'Asia Pacific (Sydney) - ap-southeast-2', value: 'ap-southeast-2' },
				{ name: 'Asia Pacific (Jakarta) - ap-southeast-3', value: 'ap-southeast-3' },
				{ name: 'Asia Pacific (Melbourne) - ap-southeast-4', value: 'ap-southeast-4' },
				{ name: 'Asia Pacific (Tokyo) - ap-northeast-1', value: 'ap-northeast-1' },
				{ name: 'Canada (Central) - ca-central-1', value: 'ca-central-1' },
				{ name: 'Canada West (Calgary) - ca-west-1', value: 'ca-west-1' },
				{ name: 'Europe (Frankfurt) - eu-central-1', value: 'eu-central-1' },
				{ name: 'Europe (Zurich) - eu-central-2', value: 'eu-central-2' },
				{ name: 'Europe (Ireland) - eu-west-1', value: 'eu-west-1' },
				{ name: 'Europe (London) - eu-west-2', value: 'eu-west-2' },
				{ name: 'Europe (Paris) - eu-west-3', value: 'eu-west-3' },
				{ name: 'Europe (Milan) - eu-south-1', value: 'eu-south-1' },
				{ name: 'Europe (Spain) - eu-south-2', value: 'eu-south-2' },
				{ name: 'Europe (Stockholm) - eu-north-1', value: 'eu-north-1' },
				{ name: 'Israel (Tel Aviv) - il-central-1', value: 'il-central-1' },
				{ name: 'Middle East (Bahrain) - me-south-1', value: 'me-south-1' },
				{ name: 'Middle East (UAE) - me-central-1', value: 'me-central-1' },
				{ name: 'South America (São Paulo) - sa-east-1', value: 'sa-east-1' },
				{ name: 'US East (N. Virginia) - us-east-1', value: 'us-east-1' },
				{ name: 'US East (Ohio) - us-east-2', value: 'us-east-2' },
				{ name: 'US West (N. California) - us-west-1', value: 'us-west-1' },
				{ name: 'US West (Oregon) - us-west-2', value: 'us-west-2' },
				{ name: 'AWS GovCloud (US-East) - us-gov-east-1', value: 'us-gov-east-1' },
				{ name: 'AWS GovCloud (US-West) - us-gov-west-1', value: 'us-gov-west-1' },
			],
			default: 'us-east-1',
			required: true,
			description: 'The AWS region',
		},
		{
			displayName: 'Session Token',
			name: 'sessionToken',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'Optional session token for temporary credentials (STS)',
		},
	];
}
