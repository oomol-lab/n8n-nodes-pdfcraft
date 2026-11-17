import type { INodeProperties } from 'n8n-workflow';

const TARGET_LANGUAGE_OPTIONS = [
	{ name: 'Arabic', value: 'ar' },
	{ name: 'Chinese (Simplified)', value: 'zh-CN' },
	{ name: 'Danish', value: 'da' },
	{ name: 'Dutch', value: 'nl' },
	{ name: 'English', value: 'en' },
	{ name: 'Finnish', value: 'fi' },
	{ name: 'French', value: 'fr' },
	{ name: 'German', value: 'de' },
	{ name: 'Hindi', value: 'hi' },
	{ name: 'Indonesian', value: 'id' },
	{ name: 'Italian', value: 'it' },
	{ name: 'Japanese', value: 'ja' },
	{ name: 'Korean', value: 'ko' },
	{ name: 'None (Keep Source Language)', value: '' },
	{ name: 'Norwegian', value: 'no' },
	{ name: 'Polish', value: 'pl' },
	{ name: 'Portuguese', value: 'pt' },
	{ name: 'Russian', value: 'ru' },
	{ name: 'Spanish', value: 'es' },
	{ name: 'Swedish', value: 'sv' },
	{ name: 'Thai', value: 'th' },
	{ name: 'Turkish', value: 'tr' },
	{ name: 'Vietnamese', value: 'vi' },
];

const NOTIFICATION_LANGUAGE_OPTIONS = [
	{ name: 'Chinese (Simplified)', value: 'zh-CN' },
	{ name: 'Chinese (Traditional)', value: 'zh-Hant' },
	{ name: 'English', value: 'en' },
	{ name: 'French', value: 'fr-FR' },
	{ name: 'German', value: 'de-DE' },
	{ name: 'Italian', value: 'it-IT' },
	{ name: 'Japanese', value: 'ja-JP' },
	{ name: 'Korean', value: 'ko-KR' },
	{ name: 'Russian', value: 'ru-RU' },
	{ name: 'Spanish', value: 'es-ES' },
];

export const pdfCraftProperties: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Transform',
				value: 'transform',
			},
		],
		default: 'transform',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['transform'],
			},
		},
		options: [
			{
				name: 'Convert / Translate',
				value: 'convert',
				description: 'Upload a PDF or EPUB, run conversion or translation, and return result',
				action: 'Convert or translate a document',
			},
			{
				name: 'Download Result',
				value: 'download',
				description: 'Get signed download URLs and optionally download the output file',
				action: 'Download a transform result',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Retrieve a transform task by UUID',
				action: 'Get a transform task',
			},
			{
				name: 'Get Many',
				value: 'getMany',
				description: 'List transform tasks from a status queue',
				action: 'Get many transform tasks',
			},
			{
				name: 'Observe Progress',
				value: 'observe',
				description: 'Inspect running task progress and preview tail updates',
				action: 'Observe transform progress',
			},
			{
				name: 'Rename Source',
				value: 'rename',
				description: 'Update the displayed input filename of a transform task',
				action: 'Rename transform source',
			},
			{
				name: 'Request Refund',
				value: 'requestRefund',
				description: 'Apply for a credit refund after an eligible technical failure',
				action: 'Request a transform refund',
			},
			{
				name: 'Update Notification',
				value: 'updateNotification',
				description: 'Update notification email or language for a running transform',
				action: 'Update transform notification',
			},
		],
		default: 'convert',
	},

	// ----------------------------------
	//         convert
	// ----------------------------------
	{
		displayName: 'Input Source',
		name: 'inputSource',
		type: 'options',
		options: [
			{
				name: 'Binary Data',
				value: 'binary',
				description: 'Use a file from an upstream n8n node binary property',
			},
			{
				name: 'Public URL',
				value: 'url',
				description: 'Download a file from a publicly accessible URL',
			},
		],
		default: 'binary',
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['convert'],
			},
		},
		description: 'Where to read the source PDF or EPUB file from',
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['convert'],
				inputSource: ['binary'],
			},
		},
		description: 'Name of the binary property containing the source PDF or EPUB file',
	},
	{
		displayName: 'File URL',
		name: 'fileUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com/book.pdf',
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['convert'],
				inputSource: ['url'],
			},
		},
		description: 'Publicly accessible direct download URL for the source PDF or EPUB',
	},
	{
		displayName: 'Input Format',
		name: 'inputFormat',
		type: 'options',
		options: [
			{ name: 'EPUB', value: 'epub' },
			{ name: 'PDF', value: 'pdf' },
		],
		default: 'pdf',
		required: true,
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['convert'],
			},
		},
		description: 'Format of the source document',
	},
	{
		displayName: 'Output Format',
		name: 'outputFormat',
		type: 'options',
		options: [
			{ name: 'EPUB', value: 'epub' },
			{ name: 'Markdown (ZIP)', value: 'markdown' },
			{ name: 'PDF', value: 'pdf' },
		],
		default: 'markdown',
		required: true,
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['convert'],
			},
		},
		description: 'Target output format (Markdown outputs are packaged as a ZIP archive)',
	},
	{
		displayName: 'Target Language',
		name: 'targetLanguage',
		type: 'options',
		options: TARGET_LANGUAGE_OPTIONS,
		default: '',
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['convert'],
			},
		},
		description:
			'Target translation language. Leave on None for conversion without translation (required for EPUB input and PDF output).',
	},
	{
		displayName: 'Wait for Completion',
		name: 'waitForCompletion',
		type: 'boolean',
		default: true,
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['convert'],
			},
		},
		description:
			'Whether to poll until the task finishes and fetch the result. Disable to return the task UUID immediately.',
	},
	{
		displayName: 'Options',
		name: 'convertOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['convert'],
			},
		},
		options: [
			{
				displayName: 'Download Filename',
				name: 'downloadFilename',
				type: 'string',
				default: '',
				placeholder: 'result.zip',
				description: 'Optional custom filename (including extension) for the downloaded result',
			},
			{
				displayName: 'Download Output File',
				name: 'downloadOutput',
				type: 'boolean',
				default: true,
				description:
					'Whether to download the output artifact into n8n binary data when waiting completes',
			},
			{
				displayName: 'Input Filename',
				name: 'inputFilename',
				type: 'string',
				default: '',
				placeholder: 'document.pdf',
				description: 'Optional display name stored with the transform task (up to 255 characters)',
			},
			{
				displayName: 'Max Wait Time (Seconds)',
				name: 'maxWaitSeconds',
				type: 'number',
				typeOptions: {
					minValue: 10,
				},
				default: 300,
				description: 'Maximum seconds to wait for task completion before timing out with UUID',
			},
			{
				displayName: 'Notification Email',
				name: 'notificationEmail',
				type: 'string',
				default: '',
				placeholder: 'user@example.com',
				description: 'Optional email address to notify once the task finishes',
			},
			{
				displayName: 'Notification Language',
				name: 'notificationLanguage',
				type: 'options',
				options: NOTIFICATION_LANGUAGE_OPTIONS,
				default: 'en',
				description: 'Language used for completion notification emails',
			},
			{
				displayName: 'Output Binary Field',
				name: 'binaryOutputProperty',
				type: 'string',
				default: 'data',
				description: 'Name of the binary property where the downloaded file will be stored',
			},
			{
				displayName: 'Poll Interval (Seconds)',
				name: 'pollIntervalSeconds',
				type: 'number',
				typeOptions: {
					minValue: 2,
				},
				default: 5,
				description: 'Seconds between task status checks while waiting for completion',
			},
			{
				displayName: 'Refinement',
				name: 'refinement',
				type: 'options',
				options: [
					{ name: 'Disabled', value: 'disabled' },
					{ name: 'Refinement With Footnotes', value: 'refinement_with_footnotes' },
				],
				default: 'disabled',
				description: 'PDF-only extraction refinement mode',
			},
			{
				displayName: 'Rendering Mode',
				name: 'renderingMode',
				type: 'options',
				options: [
					{ name: 'Auto (API Default)', value: '' },
					{ name: 'Bilingual', value: 'bilingual' },
					{ name: 'Bilingual Inline', value: 'bilingual-inline' },
					{ name: 'Replace', value: 'replace' },
					{ name: 'Source', value: 'source' },
				],
				default: '',
				description:
					'How translated content is rendered. PDF output only supports Replace; non-translation uses Source.',
			},
			{
				displayName: 'Translation Prompt',
				name: 'translationPrompt',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				default: '',
				description: 'Optional terminology or style instructions (only allowed with translation)',
			},
		],
	},

	// ----------------------------------
	//         UUID-based operations
	// ----------------------------------
	{
		displayName: 'Transform UUID',
		name: 'uuid',
		type: 'string',
		required: true,
		default: '',
		placeholder: '550e8400-e29b-41d4-a716-446655440000',
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['get', 'download', 'observe', 'rename', 'updateNotification', 'requestRefund'],
			},
		},
		description: 'The UUID of the transform task',
	},

	// ----------------------------------
	//         download
	// ----------------------------------
	{
		displayName: 'Download File to Binary',
		name: 'downloadOutput',
		type: 'boolean',
		default: true,
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['download'],
			},
		},
		description:
			'Whether to download the file into n8n binary data in addition to returning signed URLs',
	},
	{
		displayName: 'Output Binary Field',
		name: 'binaryOutputProperty',
		type: 'string',
		default: 'data',
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['download'],
				downloadOutput: [true],
			},
		},
		description: 'Name of the binary property where the downloaded file will be stored',
	},
	{
		displayName: 'Download Filename',
		name: 'downloadFilename',
		type: 'string',
		default: '',
		placeholder: 'output.zip',
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['download'],
			},
		},
		description: 'Optional custom filename (including extension) for the downloaded file',
	},

	// ----------------------------------
	//         getMany
	// ----------------------------------
	{
		displayName: 'Queue',
		name: 'queue',
		type: 'options',
		options: [
			{ name: 'Finished', value: 'finished' },
			{ name: 'Running', value: 'running' },
			{ name: 'Waiting For Upload', value: 'waiting-for-upload' },
		],
		default: 'finished',
		required: true,
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['getMany'],
			},
		},
		description: 'Task status queue to list transforms from',
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['getMany'],
			},
		},
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: {
			minValue: 1,
			maxValue: 100,
		},
		default: 50,
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['getMany'],
				returnAll: [false],
			},
		},
		description: 'Max number of results to return',
	},

	// ----------------------------------
	//         observe
	// ----------------------------------
	{
		displayName: 'Observe Options',
		name: 'observeOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['observe'],
			},
		},
		options: [
			{
				displayName: 'Cursor',
				name: 'cursor',
				type: 'string',
				default: '',
				description: 'Preview cursor returned by a previous observe call',
			},
			{
				displayName: 'Preview Limit',
				name: 'previewLimit',
				type: 'number',
				typeOptions: {
					minValue: 1,
					maxValue: 500,
				},
				default: 500,
				description: 'Maximum number of preview entries to include (clamped to 500)',
			},
		],
	},

	// ----------------------------------
	//         rename
	// ----------------------------------
	{
		displayName: 'Clear Filename',
		name: 'clearFilename',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['rename'],
			},
		},
		description: 'Whether to clear the displayed input filename instead of setting a new one',
	},
	{
		displayName: 'New Input Filename',
		name: 'newInputFilename',
		type: 'string',
		required: true,
		default: '',
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['rename'],
				clearFilename: [false],
			},
		},
		description: 'New displayed input filename (up to 255 characters)',
	},

	// ----------------------------------
	//         updateNotification
	// ----------------------------------
	{
		displayName: 'Disable Email Notification',
		name: 'disableNotification',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['updateNotification'],
			},
		},
		description: 'Whether to disable email notifications for this running task',
	},
	{
		displayName: 'Notification Email',
		name: 'notificationEmail',
		type: 'string',
		default: '',
		placeholder: 'user@example.com',
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['updateNotification'],
				disableNotification: [false],
			},
		},
		description: 'Email address to notify when the task completes',
	},
	{
		displayName: 'Notification Language',
		name: 'notificationLanguage',
		type: 'options',
		options: NOTIFICATION_LANGUAGE_OPTIONS,
		default: 'en',
		displayOptions: {
			show: {
				resource: ['transform'],
				operation: ['updateNotification'],
			},
		},
		description: 'Language used for notification emails and landing page',
	},
];
