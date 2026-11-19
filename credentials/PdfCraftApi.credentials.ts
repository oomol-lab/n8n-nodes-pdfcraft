import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';
import packageJson from '../package.json';

const PDF_CRAFT_USER_AGENT = `n8n-nodes-pdfcraft/${packageJson.version}`;

export class PdfCraftApi implements ICredentialType {
	name = 'pdfCraftApi';

	displayName = 'PDF Craft API';

	icon: Icon = {
		light: 'file:../nodes/PdfCraft/pdfcraft.svg',
		dark: 'file:../nodes/PdfCraft/pdfcraft.dark.svg',
	};

	documentationUrl = 'https://pdfcraft.ai/docs/api/overview';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			required: true,
			default: '',
			description:
				'Your OOMOL API key used as a Bearer token for PDF Craft Transform API requests',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			required: true,
			default: 'https://api.pdfcraft.ai/v1/pcc-api',
			placeholder: 'https://api.pdfcraft.ai/v1/pcc-api',
			description:
				'Base URL for the PDF Craft Transform API (default: https://api.pdfcraft.ai/v1/pcc-api)',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
				'User-Agent': PDF_CRAFT_USER_AGENT,
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/transforms/running/',
			method: 'GET',
			qs: {
				limit: 1,
			},
		},
	};
}
