import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rootDir = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

const { PdfCraft } = require(path.join(rootDir, 'dist/nodes/PdfCraft/PdfCraft.node.js'));
const { PdfCraftApi } = require(
	path.join(rootDir, 'dist/credentials/PdfCraftApi.credentials.js'),
);

function createMockExecuteContext({
	items = [{ json: {} }],
	params = {},
	binaries = {},
	continueOnFail = false,
	baseUrl = 'https://api.pdfcraft.ai/v1/pcc-api/',
	onAuthRequest,
	onHttpRequest,
}) {
	const authCalls = [];
	const httpCalls = [];

	const context = {
		getInputData: () => items,
		continueOnFail: () => continueOnFail,
		getNode: () => ({ name: 'PDF Craft', type: '@oomol-lab/n8n-nodes-pdfcraft.pdfCraft', typeVersion: 1 }),
		getCredentials: async () => ({ apiKey: 'test-key', baseUrl }),
		getNodeParameter: (name, _itemIndex, fallback) =>
			Object.prototype.hasOwnProperty.call(params, name) ? params[name] : fallback,
		helpers: {
			assertBinaryData: (itemIndex, prop) => {
				const bin = binaries[itemIndex]?.[prop];
				if (!bin) {
					throw new Error(`Missing binary property "${prop}"`);
				}
				return bin.meta;
			},
			getBinaryDataBuffer: async (itemIndex, prop) => {
				const bin = binaries[itemIndex]?.[prop];
				if (!bin) {
					throw new Error(`Missing binary buffer "${prop}"`);
				}
				return bin.buffer;
			},
			prepareBinaryData: async (buffer, fileName, mimeType) => ({
				data: buffer.toString('base64'),
				fileName,
				mimeType,
			}),
			httpRequestWithAuthentication: async (credName, options) => {
				authCalls.push({ credName, options });
				return onAuthRequest(options);
			},
			httpRequest: async (options) => {
				httpCalls.push(options);
				return onHttpRequest(options);
			},
		},
	};

	return { context, authCalls, httpCalls };
}

describe('package and credential metadata', () => {
	it('declares zero runtime dependencies and valid n8n manifest', () => {
		assert.equal(pkg.name, '@oomol-lab/n8n-nodes-pdfcraft');
		assert.equal(pkg.dependencies, undefined);
		assert.equal(pkg.n8n.strict, true);
		assert.deepEqual(pkg.n8n.credentials, ['dist/credentials/PdfCraftApi.credentials.js']);
		assert.deepEqual(pkg.n8n.nodes, ['dist/nodes/PdfCraft/PdfCraft.node.js']);
		assert.ok(pkg.keywords.includes('n8n-community-node-package'));
	});

	it('configures PdfCraftApi credential auth and free test endpoint', () => {
		const cred = new PdfCraftApi();
		assert.equal(cred.name, 'pdfCraftApi');
		assert.equal(cred.authenticate.properties.headers.Authorization, '=Bearer {{$credentials.apiKey}}');
		assert.equal(
			cred.authenticate.properties.headers['User-Agent'],
			`n8n-nodes-pdfcraft/${pkg.version}`,
		);
		assert.equal(cred.test.request.url, '/transforms/running/');
		assert.equal(cred.test.request.method, 'GET');
	});
});

describe('PdfCraft node execution', () => {
	it('converts binary PDF to Markdown ZIP with unauthenticated storage calls', async () => {
		const node = new PdfCraft();
		const uuid = '11111111-1111-4111-8111-111111111111';
		let getCount = 0;

		const { context, authCalls, httpCalls } = createMockExecuteContext({
			params: {
				resource: 'transform',
				operation: 'convert',
				inputSource: 'binary',
				binaryPropertyName: 'data',
				inputFormat: 'pdf',
				outputFormat: 'markdown',
				targetLanguage: '',
				waitForCompletion: true,
				convertOptions: {
					pollIntervalSeconds: 2,
					maxWaitSeconds: 20,
				},
			},
			binaries: {
				0: {
					data: {
						meta: { fileName: 'sample.pdf', mimeType: 'application/pdf' },
						buffer: Buffer.from('%PDF-1.4 mock'),
					},
				},
			},
			onAuthRequest: async (options) => {
				if (options.method === 'POST' && options.url.endsWith('/transforms')) {
					return {
						uuid,
						status: 'waiting_for_upload',
						input_format: 'pdf',
						input_filename: 'sample.pdf',
					};
				}
				if (options.method === 'GET' && options.url.endsWith(`/transforms/${uuid}/upload-urls`)) {
					return {
						put_url: 'https://storage.example.com/upload/1',
						headers: { 'content-type': 'application/pdf' },
					};
				}
				if (options.method === 'POST' && options.url.endsWith(`/transforms/${uuid}/launch`)) {
					return { uuid, status: 'running', input_format: 'pdf' };
				}
				if (options.method === 'GET' && options.url.endsWith(`/transforms/${uuid}`)) {
					getCount += 1;
					return {
						uuid,
						status: 'succeeded',
						input_format: 'pdf',
						input_filename: 'sample.pdf',
						parameters: { output_format: 'markdown' },
					};
				}
				if (options.method === 'GET' && options.url.endsWith(`/transforms/${uuid}/download-urls`)) {
					return {
						get_url: 'https://storage.example.com/download/1',
						head_url: 'https://storage.example.com/head/1',
					};
				}
				throw new Error(`Unexpected auth request: ${options.method} ${options.url}`);
			},
			onHttpRequest: async (options) => {
				if (options.method === 'PUT' && options.url === 'https://storage.example.com/upload/1') {
					return '';
				}
				if (options.method === 'GET' && options.url === 'https://storage.example.com/download/1') {
					return {
						body: Buffer.from('PK\x03\x04mockzip'),
						headers: { 'content-type': 'application/zip' },
					};
				}
				throw new Error(`Unexpected unauthenticated request: ${options.method} ${options.url}`);
			},
		});

		const output = await node.execute.call(context);
		assert.equal(output.length, 1);
		assert.equal(output[0].length, 1);
		assert.equal(getCount, 1);
		assert.equal(authCalls.length, 5);
		for (const call of authCalls) {
			assert.equal(call.options.headers?.['User-Agent'], `n8n-nodes-pdfcraft/${pkg.version}`);
		}
		assert.equal(httpCalls.length, 2);
		assert.equal(httpCalls[0].method, 'PUT');
		assert.equal(httpCalls[1].method, 'GET');
		assert.equal(output[0][0].json.uuid, uuid);
		assert.equal(output[0][0].binary.data.fileName, 'sample.zip');
		assert.equal(output[0][0].binary.data.mimeType, 'application/zip');
	});

	it('submits public URL without waiting when waitForCompletion is false', async () => {
		const node = new PdfCraft();
		const uuid = '22222222-2222-4222-8222-222222222222';

		const { context, authCalls, httpCalls } = createMockExecuteContext({
			params: {
				resource: 'transform',
				operation: 'convert',
				inputSource: 'url',
				fileUrl: 'https://cdn.example.com/docs/book.epub',
				inputFormat: 'epub',
				outputFormat: 'epub',
				targetLanguage: 'zh-CN',
				waitForCompletion: false,
				convertOptions: {
					renderingMode: 'bilingual',
				},
			},
			onAuthRequest: async (options) => {
				if (options.method === 'POST' && options.url.endsWith('/transforms')) {
					assert.equal(options.body.input_filename, 'book.epub');
					return { uuid, status: 'waiting_for_upload', input_format: 'epub' };
				}
				if (options.method === 'GET' && options.url.endsWith('/upload-urls')) {
					return { put_url: 'https://storage.example.com/upload/2', headers: {} };
				}
				if (options.method === 'POST' && options.url.endsWith('/launch')) {
					assert.deepEqual(options.body, {
						output_format: 'epub',
						target_language: 'zh-CN',
						rendering_mode: 'bilingual',
					});
					return { uuid, status: 'running', input_format: 'epub' };
				}
				throw new Error(`Unexpected auth request: ${options.method} ${options.url}`);
			},
			onHttpRequest: async (options) => {
				if (options.method === 'GET' && options.url === 'https://cdn.example.com/docs/book.epub') {
					return { body: Buffer.from('epub-bytes'), headers: {} };
				}
				if (options.method === 'PUT' && options.url === 'https://storage.example.com/upload/2') {
					return '';
				}
				throw new Error(`Unexpected HTTP request: ${options.method} ${options.url}`);
			},
		});

		const output = await node.execute.call(context);
		assert.equal(authCalls.length, 3);
		assert.equal(httpCalls.length, 2);
		assert.equal(output[0][0].json.status, 'running');
		assert.equal(output[0][0].binary, undefined);
	});

	it('preserves task UUID when upload fails after task creation', async () => {
		const node = new PdfCraft();
		const uuid = '33333333-3333-4333-8333-333333333333';

		const { context } = createMockExecuteContext({
			params: {
				resource: 'transform',
				operation: 'convert',
				inputSource: 'binary',
				binaryPropertyName: 'data',
				inputFormat: 'pdf',
				outputFormat: 'markdown',
				targetLanguage: '',
				waitForCompletion: false,
				convertOptions: {},
			},
			binaries: {
				0: {
					data: { meta: { fileName: 'a.pdf' }, buffer: Buffer.from('pdf') },
				},
			},
			onAuthRequest: async (options) => {
				if (options.method === 'POST' && options.url.endsWith('/transforms')) {
					return { uuid, status: 'waiting_for_upload', input_format: 'pdf' };
				}
				if (options.method === 'GET' && options.url.endsWith('/upload-urls')) {
					return { put_url: 'https://storage.example.com/upload/fail', headers: {} };
				}
				throw new Error(`Unexpected call: ${options.url}`);
			},
			onHttpRequest: async () => {
				throw new Error('503 Storage unavailable');
			},
		});

		await assert.rejects(() => node.execute.call(context), (err) => {
			assert.match(err.message, new RegExp(uuid));
			return true;
		});
	});

	it('rejects invalid format combinations before calling API', async () => {
		const node = new PdfCraft();
		const { context, authCalls } = createMockExecuteContext({
			params: {
				resource: 'transform',
				operation: 'convert',
				inputSource: 'url',
				fileUrl: 'https://example.com/a.epub',
				inputFormat: 'epub',
				outputFormat: 'markdown',
				targetLanguage: 'en',
				waitForCompletion: false,
				convertOptions: {},
			},
			onAuthRequest: async () => {
				throw new Error('Should not call API');
			},
			onHttpRequest: async () => {
				throw new Error('Should not call HTTP');
			},
		});

		await assert.rejects(() => node.execute.call(context), /EPUB input only supports EPUB output/);
		assert.equal(authCalls.length, 0);
	});

	it('paginates getMany across cursors and honors limit', async () => {
		const node = new PdfCraft();
		const { context } = createMockExecuteContext({
			params: {
				resource: 'transform',
				operation: 'getMany',
				queue: 'finished',
				returnAll: false,
				limit: 3,
			},
			onAuthRequest: async (options) => {
				if (!options.qs.cursor) {
					return {
						transforms: [{ uuid: 'u1' }, { uuid: 'u2' }],
						next_cursor: 'c2',
					};
				}
				return {
					transforms: [{ uuid: 'u3' }, { uuid: 'u4' }],
				};
			},
			onHttpRequest: async () => ({}),
		});

		const output = await node.execute.call(context);
		assert.deepEqual(
			output[0].map((item) => item.json.uuid),
			['u1', 'u2', 'u3'],
		);
	});

	it('handles continueOnFail cleanly for API failures', async () => {
		const node = new PdfCraft();
		const { context } = createMockExecuteContext({
			continueOnFail: true,
			params: {
				resource: 'transform',
				operation: 'get',
				uuid: '44444444-4444-4444-8444-444444444444',
			},
			onAuthRequest: async () => {
				throw new Error('Not found');
			},
			onHttpRequest: async () => ({}),
		});

		const output = await node.execute.call(context);
		assert.equal(output[0].length, 1);
		assert.ok(typeof output[0][0].json.error === 'string');
	});
});
