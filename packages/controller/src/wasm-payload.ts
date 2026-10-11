// SPDX-License-Identifier: AGPL-3.0-only
/** Encode binary bytes with bounded argument batches and no per-byte array. */
export function binaryBase64(bytes: Uint8Array): string {
	const chunks: string[] = [];
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
	}
	return btoa(chunks.join(""));
}
