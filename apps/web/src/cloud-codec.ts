import { deserialize } from "../../../packages/simulation-core/src/index";
const MAX_COMPRESSED = 1_048_576,
  MAX_EXPANDED = 8_388_608;
export async function compressSnapshot(snapshot: string): Promise<ArrayBuffer> {
  const input = new TextEncoder().encode(snapshot);
  if (input.length > MAX_EXPANDED)
    throw Error(
      "온라인 저장은 원본 8 MiB까지 지원합니다. 파일 내보내기를 이용하세요",
    );
  deserialize(snapshot);
  const buffer = await new Response(
    new Blob([input]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
  if (buffer.byteLength > MAX_COMPRESSED)
    throw Error(
      "압축 저장 파일이 1 MiB를 초과했습니다. 로컬 저장은 유지됩니다",
    );
  return buffer;
}
export async function expandSnapshot(response: Response): Promise<string> {
  const data = await response.arrayBuffer();
  if (data.byteLength > MAX_COMPRESSED) throw Error("온라인 저장 크기 초과");
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== response.headers.get("X-Save-Checksum"))
    throw Error("온라인 저장 체크섬 불일치");
  const reader = new Blob([data])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_EXPANDED) {
      await reader.cancel();
      throw Error("압축 해제 크기 제한 초과");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const snapshot = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  deserialize(snapshot);
  return snapshot;
}
