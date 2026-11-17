import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import type {
	InputFormat,
	OutputFormat,
	TransformQueue,
	TransformRecord,
	UploadUrls,
} from './PdfCraft.helpers';
import {
	buildAndValidateLaunchRequest,
	downloadUnauthenticatedBuffer,
	pdfCraftApiRequest,
	pollTransformUntilComplete,
	resolveInputFilename,
	resolveTransformOutput,
	uploadToSignedUrl,
} from './PdfCraft.helpers';
import { pdfCraftProperties } from './PdfCraft.properties';

interface ConvertOptions {
	downloadOutput?: boolean;
	downloadFilename?: string;
	inputFilename?: string;
	maxWaitSeconds?: number;
	notificationEmail?: string;
	notificationLanguage?: string;
	binaryOutputProperty?: string;
	pollIntervalSeconds?: number;
	refinement?: string;
	renderingMode?: string;
	translationPrompt?: string;
}

/**
 * Execute the full create -> upload -> launch -> optional poll & download workflow.
 */
async function executeConvert(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const inputSource = context.getNodeParameter('inputSource', itemIndex) as 'binary' | 'url';
	const inputFormat = context.getNodeParameter('inputFormat', itemIndex) as InputFormat;
	const outputFormat = context.getNodeParameter('outputFormat', itemIndex) as OutputFormat;
	const targetLanguage = context.getNodeParameter('targetLanguage', itemIndex, '') as string;
	const waitForCompletion = context.getNodeParameter('waitForCompletion', itemIndex) as boolean;
	const options = context.getNodeParameter('convertOptions', itemIndex, {}) as ConvertOptions;

	const launchBody = buildAndValidateLaunchRequest(context, itemIndex, inputFormat, {
		outputFormat,
		targetLanguage,
		renderingMode: options.renderingMode,
		refinement: options.refinement,
		translationPrompt: options.translationPrompt,
		notificationEmail: options.notificationEmail,
		notificationLanguage: options.notificationLanguage,
	});

	let fileBuffer: Buffer;
	let binaryFileName: string | undefined;
	let sourceUrl: string | undefined;

	if (inputSource === 'binary') {
		const binaryPropertyName = context.getNodeParameter('binaryPropertyName', itemIndex) as string;
		const binaryMeta = context.helpers.assertBinaryData(itemIndex, binaryPropertyName);
		binaryFileName = binaryMeta.fileName;
		fileBuffer = await context.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	} else {
		sourceUrl = context.getNodeParameter('fileUrl', itemIndex) as string;
		if (!sourceUrl.trim()) {
			throw new NodeOperationError(context.getNode(), 'File URL cannot be empty', { itemIndex });
		}
		const downloaded = await downloadUnauthenticatedBuffer(context, itemIndex, sourceUrl.trim());
		fileBuffer = downloaded.buffer;
	}

	const inputFilename = resolveInputFilename(options.inputFilename, binaryFileName, sourceUrl);
	const createBody: IDataObject = { input_format: inputFormat };
	if (inputFilename) {
		createBody.input_filename = inputFilename;
	}

	const created = await pdfCraftApiRequest<TransformRecord>(
		context,
		itemIndex,
		'POST',
		'/transforms',
		{ body: createBody },
	);
	const uuid = created.uuid;
	if (!uuid) {
		throw new NodeOperationError(context.getNode(), 'PDF Craft did not return a transform UUID', {
			itemIndex,
		});
	}

	let launched: TransformRecord;
	try {
		const uploadInfo = await pdfCraftApiRequest<Partial<UploadUrls>>(
			context,
			itemIndex,
			'GET',
			`/transforms/${uuid}/upload-urls`,
		);
		if (!uploadInfo.put_url || !uploadInfo.headers) {
			throw new NodeOperationError(
				context.getNode(),
				'PDF Craft did not return presigned upload URLs',
				{ itemIndex },
			);
		}

		await uploadToSignedUrl(context, itemIndex, uploadInfo.put_url, uploadInfo.headers, fileBuffer);

		launched = await pdfCraftApiRequest<TransformRecord>(
			context,
			itemIndex,
			'POST',
			`/transforms/${uuid}/launch`,
			{ body: launchBody },
		);
	} catch (error) {
		const baseMessage = error instanceof Error ? error.message : 'Request failed';
		throw new NodeOperationError(
			context.getNode(),
			`PDF Craft task ${uuid}: ${baseMessage}. Check or resume this UUID instead of re-creating a duplicate task.`,
			{ itemIndex },
		);
	}

	if (!waitForCompletion) {
		return {
			json: launched,
			pairedItem: { item: itemIndex },
		};
	}

	const completed = await pollTransformUntilComplete(
		context,
		itemIndex,
		uuid,
		options.pollIntervalSeconds ?? 5,
		options.maxWaitSeconds ?? 300,
	);

	return resolveTransformOutput(context, itemIndex, completed, {
		downloadBinary: options.downloadOutput ?? true,
		binaryOutputProperty: options.binaryOutputProperty?.trim() || 'data',
		downloadFilename: options.downloadFilename,
		outputFormatHint: outputFormat,
	});
}

/**
 * List transform tasks from a status queue with pagination support.
 */
async function executeGetMany(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const queue = context.getNodeParameter('queue', itemIndex) as TransformQueue;
	const returnAll = context.getNodeParameter('returnAll', itemIndex) as boolean;
	const limit = returnAll ? 100 : (context.getNodeParameter('limit', itemIndex) as number);

	const results: TransformRecord[] = [];
	let cursor: string | undefined;

	do {
		const qs: IDataObject = {
			limit: returnAll ? 100 : Math.min(100, limit - results.length),
		};
		if (cursor) {
			qs.cursor = cursor;
		}

		const page = await pdfCraftApiRequest<{
			transforms?: TransformRecord[];
			next_cursor?: string;
		}>(context, itemIndex, 'GET', `/transforms/${queue}/`, { qs });

		if (Array.isArray(page.transforms)) {
			results.push(...page.transforms);
		}
		cursor = page.next_cursor;
	} while (cursor && (returnAll || results.length < limit));

	const trimmed = returnAll ? results : results.slice(0, limit);
	return trimmed.map((record) => ({
		json: record,
		pairedItem: { item: itemIndex },
	}));
}

/**
 * Dispatch a single Transform resource operation for the given item index.
 */
async function executeTransformOperation(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<INodeExecutionData[]> {
	if (operation === 'convert') {
		return [await executeConvert(context, itemIndex)];
	}

	if (operation === 'getMany') {
		return executeGetMany(context, itemIndex);
	}

	const uuid = (context.getNodeParameter('uuid', itemIndex) as string).trim();
	if (!uuid) {
		throw new NodeOperationError(context.getNode(), 'Transform UUID is required', { itemIndex });
	}

	if (operation === 'get') {
		const task = await pdfCraftApiRequest<TransformRecord>(
			context,
			itemIndex,
			'GET',
			`/transforms/${uuid}`,
		);
		return [{ json: task, pairedItem: { item: itemIndex } }];
	}

	if (operation === 'download') {
		const downloadBinary = context.getNodeParameter('downloadOutput', itemIndex) as boolean;
		const downloadFilename = context.getNodeParameter('downloadFilename', itemIndex, '') as string;
		const binaryOutputProperty = context.getNodeParameter(
			'binaryOutputProperty',
			itemIndex,
			'data',
		) as string;

		const task = await pdfCraftApiRequest<TransformRecord>(
			context,
			itemIndex,
			'GET',
			`/transforms/${uuid}`,
		);
		return [
			await resolveTransformOutput(context, itemIndex, task, {
				downloadBinary,
				binaryOutputProperty: binaryOutputProperty.trim() || 'data',
				downloadFilename,
			}),
		];
	}

	if (operation === 'observe') {
		const observeOptions = context.getNodeParameter('observeOptions', itemIndex, {}) as {
			cursor?: string;
			previewLimit?: number;
		};
		const qs: IDataObject = {};
		if (observeOptions.cursor?.trim()) {
			qs.cursor = observeOptions.cursor.trim();
		}
		if (observeOptions.previewLimit !== undefined) {
			qs.preview_limit = observeOptions.previewLimit;
		}
		const observation = await pdfCraftApiRequest<IDataObject>(
			context,
			itemIndex,
			'GET',
			`/transforms/${uuid}/observation`,
			{ qs },
		);
		return [{ json: observation, pairedItem: { item: itemIndex } }];
	}

	if (operation === 'rename') {
		const clearFilename = context.getNodeParameter('clearFilename', itemIndex) as boolean;
		const body: IDataObject = clearFilename
			? { input_filename: null }
			: {
					input_filename: (
						context.getNodeParameter('newInputFilename', itemIndex) as string
					).trim(),
				};
		const updated = await pdfCraftApiRequest<TransformRecord>(
			context,
			itemIndex,
			'PATCH',
			`/transforms/${uuid}`,
			{ body },
		);
		return [{ json: updated, pairedItem: { item: itemIndex } }];
	}

	if (operation === 'updateNotification') {
		const disableNotification = context.getNodeParameter(
			'disableNotification',
			itemIndex,
		) as boolean;
		const notificationLanguage = context.getNodeParameter(
			'notificationLanguage',
			itemIndex,
		) as string;
		const body: IDataObject = {
			notification_language: notificationLanguage,
		};
		if (disableNotification) {
			body.notification_email = null;
		} else {
			const email = (context.getNodeParameter('notificationEmail', itemIndex) as string).trim();
			if (email) {
				body.notification_email = email;
			}
		}
		const settings = await pdfCraftApiRequest<IDataObject>(
			context,
			itemIndex,
			'PATCH',
			`/transforms/${uuid}/notification`,
			{ body },
		);
		return [{ json: settings, pairedItem: { item: itemIndex } }];
	}

	if (operation === 'requestRefund') {
		const refund = await pdfCraftApiRequest<IDataObject>(
			context,
			itemIndex,
			'POST',
			`/transforms/${uuid}/refund`,
			{ body: {} },
		);
		return [{ json: refund, pairedItem: { item: itemIndex } }];
	}

	throw new NodeOperationError(context.getNode(), `Unsupported operation "${operation}"`, {
		itemIndex,
	});
}

export class PdfCraft implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PDF Craft',
		name: 'pdfCraft',
		icon: { light: 'file:pdfcraft.svg', dark: 'file:pdfcraft.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Convert scanned PDFs to Markdown or EPUB and translate PDF and EPUB documents using PDF Craft Cloud API',
		defaults: {
			name: 'PDF Craft',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'pdfCraftApi',
				required: true,
			},
		],
		properties: pdfCraftProperties,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;

				if (resource !== 'transform') {
					throw new NodeOperationError(this.getNode(), `Unsupported resource "${resource}"`, {
						itemIndex,
					});
				}

				const outputs = await executeTransformOperation(this, itemIndex, operation);
				returnData.push(...outputs);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, {
						itemIndex,
						httpCode: error.httpCode ?? undefined,
						message: error.message,
						description: error.description ?? undefined,
					});
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
			}
		}

		return [returnData];
	}
}
