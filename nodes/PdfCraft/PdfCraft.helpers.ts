import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INodeExecutionData,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

export type InputFormat = 'pdf' | 'epub';
export type OutputFormat = 'markdown' | 'epub' | 'pdf';
export type TransformQueue = 'running' | 'waiting-for-upload' | 'finished';

export interface TransformRecord extends IDataObject {
	uuid: string;
	status: 'waiting_for_upload' | 'running' | 'succeeded' | 'failed' | 'cancelled';
	input_format: InputFormat;
	input_filename?: string;
	parameters?: IDataObject;
	refund_status?: 'not_required' | 'available' | 'submitted';
	error?: {
		code: string;
		message: string;
	};
}

export interface SignedUrls extends IDataObject {
	get_url: string;
	head_url: string;
}

export interface UploadUrls extends IDataObject {
	put_url: string;
	headers: Record<string, string>;
}

export interface LaunchParametersInput {
	outputFormat: OutputFormat;
	targetLanguage?: string;
	renderingMode?: string;
	refinement?: string;
	translationPrompt?: string;
	notificationEmail?: string;
	notificationLanguage?: string;
}

const DEFAULT_BASE_URL = 'https://api.pdfcraft.ai/v1/pcc-api';

const OUTPUT_FILE_META: Record<OutputFormat, { extension: string; mimeType: string }> = {
	markdown: { extension: '.zip', mimeType: 'application/zip' },
	epub: { extension: '.epub', mimeType: 'application/epub+zip' },
	pdf: { extension: '.pdf', mimeType: 'application/pdf' },
};

/**
 * Resolve the configured PDF Craft base URL without trailing slashes.
 */
export async function getBaseUrl(context: IExecuteFunctions): Promise<string> {
	const credentials = await context.getCredentials('pdfCraftApi');
	const rawUrl = typeof credentials.baseUrl === 'string' ? credentials.baseUrl.trim() : '';
	return (rawUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/**
 * Execute an authenticated request against the PDF Craft Transform REST API.
 */
export async function pdfCraftApiRequest<T>(
	context: IExecuteFunctions,
	itemIndex: number,
	method: IHttpRequestMethods,
	path: string,
	options: {
		body?: IDataObject;
		qs?: IDataObject;
	} = {},
): Promise<T> {
	const baseUrl = await getBaseUrl(context);
	const requestOptions: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${path}`,
		json: true,
	};

	if (options.qs && Object.keys(options.qs).length > 0) {
		requestOptions.qs = options.qs;
	}
	if (options.body && Object.keys(options.body).length > 0) {
		requestOptions.body = options.body;
	}

	try {
		return (await context.helpers.httpRequestWithAuthentication.call(
			context,
			'pdfCraftApi',
			requestOptions,
		)) as T;
	} catch (error) {
		throw new NodeApiError(context.getNode(), error, { itemIndex });
	}
}

/**
 * Convert an HTTP response payload to a Node.js Buffer.
 */
function toBuffer(payload: unknown): Buffer {
	if (Buffer.isBuffer(payload)) {
		return payload;
	}
	if (payload instanceof ArrayBuffer) {
		return Buffer.from(payload);
	}
	if (ArrayBuffer.isView(payload)) {
		return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
	}
	if (typeof payload === 'string') {
		return Buffer.from(payload, 'binary');
	}
	throw new Error('Unexpected binary response payload type');
}

/**
 * Download binary bytes from an unauthenticated external or presigned URL.
 */
export async function downloadUnauthenticatedBuffer(
	context: IExecuteFunctions,
	itemIndex: number,
	url: string,
): Promise<{ buffer: Buffer; mimeType?: string }> {
	try {
		const response = (await context.helpers.httpRequest({
			method: 'GET',
			url,
			encoding: 'arraybuffer',
			returnFullResponse: true,
		})) as {
			body: unknown;
			headers?: Record<string, string | string[]>;
		};

		const contentTypeHeader = response.headers?.['content-type'];
		const rawMime = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader;
		const mimeType = rawMime ? rawMime.split(';')[0]?.trim() : undefined;

		return {
			buffer: toBuffer(response.body),
			mimeType,
		};
	} catch (error) {
		throw new NodeApiError(context.getNode(), error, {
			itemIndex,
			message: `Failed to download file from URL: ${(error as Error).message}`,
		});
	}
}

/**
 * Upload source bytes directly to a presigned storage URL without API credentials.
 */
export async function uploadToSignedUrl(
	context: IExecuteFunctions,
	itemIndex: number,
	putUrl: string,
	headers: Record<string, string>,
	body: Buffer,
): Promise<void> {
	try {
		await context.helpers.httpRequest({
			method: 'PUT',
			url: putUrl,
			headers,
			body,
			json: false,
		});
	} catch (error) {
		throw new NodeApiError(context.getNode(), error, {
			itemIndex,
			message: `Failed to upload source document to presigned storage URL: ${(error as Error).message}`,
		});
	}
}

/**
 * Build and validate a LaunchRequest payload against PDF Craft conversion constraints.
 */
export function buildAndValidateLaunchRequest(
	context: IExecuteFunctions,
	itemIndex: number,
	inputFormat: InputFormat,
	input: LaunchParametersInput,
): IDataObject {
	const {
		outputFormat,
		targetLanguage,
		renderingMode,
		refinement,
		translationPrompt,
		notificationEmail,
		notificationLanguage,
	} = input;

	const cleanLanguage = targetLanguage?.trim() || undefined;
	const cleanRendering = renderingMode?.trim() || undefined;
	const cleanPrompt = translationPrompt?.trim() || undefined;
	const cleanRefinement = refinement?.trim() || undefined;
	const cleanEmail = notificationEmail?.trim() || undefined;
	const cleanNotifyLang = notificationLanguage?.trim() || undefined;

	const assertValid = (condition: boolean, message: string): void => {
		if (!condition) {
			throw new NodeOperationError(context.getNode(), message, { itemIndex });
		}
	};

	if (inputFormat === 'epub') {
		assertValid(outputFormat === 'epub', 'EPUB input only supports EPUB output');
		assertValid(Boolean(cleanLanguage), 'EPUB input requires a Target Language');
		assertValid(
			!cleanRefinement || cleanRefinement === 'disabled',
			'EPUB input does not support refinement',
		);
	}

	if (outputFormat === 'pdf') {
		assertValid(Boolean(cleanLanguage), 'PDF output requires a Target Language');
		assertValid(
			!cleanRendering || cleanRendering === 'replace',
			'PDF output only supports the "replace" rendering mode',
		);
	}

	if (!cleanLanguage) {
		assertValid(!cleanPrompt, 'Translation Prompt requires a Target Language');
		assertValid(
			!cleanRendering || cleanRendering === 'source',
			'Rendering mode without translation must be "source" (or left on Auto)',
		);
	} else {
		assertValid(
			cleanRendering !== 'source',
			'Translation does not support the "source" rendering mode',
		);
	}

	const payload: IDataObject = {
		output_format: outputFormat,
	};

	if (cleanLanguage) payload.target_language = cleanLanguage;
	if (cleanRendering) payload.rendering_mode = cleanRendering;
	if (cleanPrompt) payload.translation_prompt = cleanPrompt;
	if (cleanRefinement && inputFormat !== 'epub') payload.refinement = cleanRefinement;
	if (cleanEmail) {
		payload.notification_email = cleanEmail;
		if (cleanNotifyLang) payload.notification_language = cleanNotifyLang;
	}

	return payload;
}

/**
 * Derive a clean optional display filename (at most 255 code points).
 */
export function resolveInputFilename(
	explicitName?: string,
	binaryFileName?: string,
	sourceUrl?: string,
): string | undefined {
	let candidate = explicitName?.trim() || binaryFileName?.trim();

	if (!candidate && sourceUrl) {
		try {
			const parsed = new URL(sourceUrl);
			const lastSegment = parsed.pathname.split('/').filter(Boolean).pop();
			if (lastSegment) {
				candidate = decodeURIComponent(lastSegment);
			}
		} catch {
			// Ignore malformed URLs here; downstream request will surface URL errors.
		}
	}

	if (!candidate) return undefined;
	const codePoints = Array.from(candidate);
	return codePoints.slice(0, 255).join('');
}

/**
 * Derive output filename and MIME type for a downloaded transform artifact.
 */
export function resolveOutputFileMeta(
	outputFormat: OutputFormat | undefined,
	requestedFilename: string | undefined,
	inputFilename: string | undefined,
	uuid: string,
	headerMimeType?: string,
): { fileName: string; mimeType: string } {
	const formatMeta = outputFormat ? OUTPUT_FILE_META[outputFormat] : undefined;
	const cleanRequested = requestedFilename?.trim();

	if (cleanRequested) {
		return {
			fileName: cleanRequested,
			mimeType: formatMeta?.mimeType || headerMimeType || 'application/octet-stream',
		};
	}

	const ext = formatMeta?.extension ?? '';
	const baseName = inputFilename ? inputFilename.replace(/\.(pdf|epub)$/i, '') : `pdfcraft-${uuid}`;
	return {
		fileName: `${baseName || `pdfcraft-${uuid}`}${ext}`,
		mimeType: formatMeta?.mimeType || headerMimeType || 'application/octet-stream',
	};
}

/**
 * Poll GET /transforms/{uuid} until it succeeds, fails, or exceeds maxWaitSeconds.
 */
export async function pollTransformUntilComplete(
	context: IExecuteFunctions,
	itemIndex: number,
	uuid: string,
	pollIntervalSeconds: number,
	maxWaitSeconds: number,
): Promise<TransformRecord> {
	const intervalMs = Math.max(2, pollIntervalSeconds) * 1000;
	const deadline = Date.now() + Math.max(10, maxWaitSeconds) * 1000;

	while (true) {
		const task = await pdfCraftApiRequest<TransformRecord>(
			context,
			itemIndex,
			'GET',
			`/transforms/${uuid}`,
		);

		if (task.status === 'succeeded') {
			return task;
		}

		if (task.status === 'failed' || task.status === 'cancelled') {
			const detail = task.error?.message ? `: ${task.error.message}` : '';
			const code = task.error?.code ? ` (${task.error.code})` : '';
			const refund = task.refund_status ? ` [refund_status: ${task.refund_status}]` : '';
			throw new NodeOperationError(
				context.getNode(),
				`PDF Craft task ${uuid} ended with status "${task.status}"${code}${detail}${refund}`,
				{ itemIndex },
			);
		}

		if (Date.now() >= deadline) {
			throw new NodeOperationError(
				context.getNode(),
				`PDF Craft task ${uuid} is still "${task.status}" after waiting ${maxWaitSeconds}s. Resume checking or downloading with UUID "${uuid}" instead of re-submitting.`,
				{ itemIndex },
			);
		}

		await sleep(intervalMs);
	}
}

/**
 * Fetch download URLs and optionally download the output artifact into n8n binary data.
 */
export async function resolveTransformOutput(
	context: IExecuteFunctions,
	itemIndex: number,
	task: TransformRecord,
	options: {
		downloadBinary: boolean;
		binaryOutputProperty: string;
		downloadFilename?: string;
		outputFormatHint?: OutputFormat;
	},
): Promise<INodeExecutionData> {
	const qs: IDataObject = {};
	const cleanDownloadName = options.downloadFilename?.trim();
	if (cleanDownloadName) {
		qs.filename = cleanDownloadName;
	}

	const downloadUrls = await pdfCraftApiRequest<SignedUrls>(
		context,
		itemIndex,
		'GET',
		`/transforms/${task.uuid}/download-urls`,
		{ qs },
	);

	const json: IDataObject = {
		...task,
		download_urls: downloadUrls,
	};

	if (!options.downloadBinary) {
		return {
			json,
			pairedItem: { item: itemIndex },
		};
	}

	const { buffer, mimeType: headerMime } = await downloadUnauthenticatedBuffer(
		context,
		itemIndex,
		downloadUrls.get_url,
	);

	const paramFormat = task.parameters?.output_format as OutputFormat | undefined;
	const outputFormat = options.outputFormatHint ?? paramFormat;
	const { fileName, mimeType } = resolveOutputFileMeta(
		outputFormat,
		cleanDownloadName,
		task.input_filename,
		task.uuid,
		headerMime,
	);

	const binaryData = await context.helpers.prepareBinaryData(buffer, fileName, mimeType);
	return {
		json,
		binary: {
			[options.binaryOutputProperty]: binaryData,
		},
		pairedItem: { item: itemIndex },
	};
}
