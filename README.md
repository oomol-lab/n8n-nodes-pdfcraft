# @oomol-lab/n8n-nodes-pdfcraft

This is an n8n community node that lets you use **PDF Craft** in your n8n workflows.

[PDF Craft](https://pdfcraft.ai) is a cloud document conversion and AI translation service built around [oomol-lab/pdf-craft](https://github.com/oomol-lab/pdf-craft). It converts scanned PDFs into structured Markdown or EPUB, and translates PDF and EPUB documents across 22 target languages.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

- [Installation](#installation)
- [Operations](#operations)
- [Credentials](#credentials)
- [Compatibility](#compatibility)
- [Usage](#usage)
- [Resources](#resources)
- [Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation, and install `@oomol-lab/n8n-nodes-pdfcraft`.

## Operations

All operations act on the **Transform** resource:

* **Convert / Translate** — Upload a PDF or EPUB from n8n binary data or a public URL, launch conversion or translation, optionally wait for completion, and download the resulting Markdown ZIP, EPUB, or PDF into n8n binary data.
* **Get** — Retrieve task metadata and status by transform UUID.
* **Get Many** — List tasks in the `running`, `waiting-for-upload`, or `finished` queues (with `Return All` or `Limit`).
* **Observe Progress** — Inspect active task stage, page/word counters, and tail preview cursors.
* **Download Result** — Retrieve temporary signed download URLs for a succeeded task and optionally download the artifact into n8n binary data.
* **Rename Source** — Update or clear the displayed input filename on a task.
* **Update Notification** — Set, update, or disable completion email notifications on a running task.
* **Request Refund** — Apply for a credit refund after an eligible technical failure.

## Credentials

To authenticate with the PDF Craft Cloud API (`https://api.pdfcraft.ai/v1/pcc-api`):

1. Sign in to the [OOMOL Console](https://console.oomol.com/) and generate an **API Key**.
2. In n8n, create a new **PDF Craft API** credential and paste your API key.
3. Keep the default **Base URL** (`https://api.pdfcraft.ai/v1/pcc-api`), or switch it to a custom/development gateway if needed.

Using the Transform API consumes OOMOL credits based on document volume and translation usage.

## Compatibility

* Built with `@n8n/node-cli` (`n8nNodesApiVersion: 1`, `strict: true`) with zero runtime dependencies, compatible with both self-hosted n8n and n8n Cloud verification guidelines.
* Requires Node.js 20+ / n8n 1.x+.

## Usage

* **Markdown outputs are ZIP archives**: When `Output Format` is `Markdown (ZIP)`, the downloaded binary file is a `.zip` containing `document.md` and extracted assets. Connect n8n's built-in **Compression** node (`Decompress`) afterward to unpack the Markdown file inside your workflow.
* **Long-running books**: For large scanned books that may take longer than your n8n execution timeout, disable **Wait for Completion** to get the task `uuid` immediately, then combine a **Wait** node with **Get** and **Download Result**.
* **Format & translation constraints**:
  * EPUB input only outputs EPUB and requires a `Target Language` (no refinement).
  * PDF output requires a `Target Language` and only supports `Replace` rendering mode.
  * Translation cannot use `Source` rendering mode; non-translation cannot use `Translation Prompt`.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [PDF Craft documentation](https://pdfcraft.ai/docs)
* [PDF Craft API overview](https://pdfcraft.ai/docs/api/overview)
* [oomol-lab/pdf-craft on GitHub](https://github.com/oomol-lab/pdf-craft)

## Version history

### 0.1.0

* Initial release with `PDF Craft API` credential and `PDF Craft` node covering full Transform lifecycle operations (`Convert / Translate`, `Get`, `Get Many`, `Observe Progress`, `Download Result`, `Rename Source`, `Update Notification`, `Request Refund`).
