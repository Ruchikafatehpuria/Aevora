import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { PassThrough, Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Object storage. Local disk for now; the interface is shaped so an S3/R2 driver can replace it.
 * Keys are generated server-side and never derived from user filenames, so path traversal is impossible.
 */
export interface StorageDriver {
  write(input: Readable, maxBytes: number): Promise<{ key: string; size: number; sha256: string; head: Buffer }>;
  read(key: string, range?: { start: number; end: number }): Promise<Readable>;
  size(key: string): Promise<number>;
  remove(key: string): Promise<void>;
}

export class SizeLimitError extends Error {}

const root = path.resolve(process.env.STORAGE_DIR ?? "./storage");

function assertKey(key: string) {
  if (!/^[a-f0-9]{2}\/[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid storage key");
}

function keyPath(key: string) {
  assertKey(key);
  return path.join(root, key);
}

function newKey() {
  const id = randomUUID();
  return `${id.slice(0, 2)}/${id}`;
}

/** Counts bytes, hashes them, keeps the first 4 KB for type sniffing, and enforces a size cap. */
function meterStream(maxBytes: number) {
  const hash = createHash("sha256");
  let size = 0;
  const headChunks: Buffer[] = [];
  let headLen = 0;
  const stream = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > maxBytes) return cb(new SizeLimitError(`File exceeds the ${Math.round(maxBytes / 1048576)} MB limit`));
      hash.update(chunk);
      if (headLen < 4100) {
        headChunks.push(chunk);
        headLen += chunk.length;
      }
      cb(null, chunk);
    },
  });
  return { stream, result: () => ({ size, sha256: hash.digest("hex"), head: Buffer.concat(headChunks).subarray(0, 4100) }) };
}

class LocalDiskStorage implements StorageDriver {
  async write(input: Readable, maxBytes: number) {
    const key = newKey();
    const dest = keyPath(key);
    await mkdir(path.dirname(dest), { recursive: true });
    const meter = meterStream(maxBytes);
    try {
      await pipeline(input, meter.stream, createWriteStream(dest, { flags: "wx", mode: 0o600 }));
    } catch (e) {
      await rm(dest, { force: true });
      throw e;
    }
    return { key, ...meter.result() };
  }

  async read(key: string, range?: { start: number; end: number }) {
    return createReadStream(keyPath(key), range);
  }

  async size(key: string) {
    return (await stat(keyPath(key))).size;
  }

  async remove(key: string) {
    await rm(keyPath(key), { force: true });
  }
}

/**
 * S3-compatible object storage (Supabase Storage, Cloudflare R2, AWS S3, MinIO). The bucket must be private;
 * files are only ever served through the authenticated, signed download route.
 */
class S3Storage implements StorageDriver {
  private bucket = process.env.S3_BUCKET!;
  private clientPromise = (async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    return new S3Client({
      endpoint: process.env.S3_ENDPOINT || undefined,
      region: process.env.S3_REGION || "us-east-1",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
    });
  })();

  async write(input: Readable, maxBytes: number) {
    const key = newKey();
    const { Upload } = await import("@aws-sdk/lib-storage");
    const meter = meterStream(maxBytes);
    const body = new PassThrough();
    const upload = new Upload({
      client: await this.clientPromise,
      params: { Bucket: this.bucket, Key: key, Body: body, ContentType: "application/octet-stream" },
    });
    const sending = upload.done();
    try {
      await Promise.all([pipeline(input, meter.stream, body), sending]);
    } catch (e) {
      await upload.abort().catch(() => {});
      await this.remove(key).catch(() => {});
      throw e;
    }
    return { key, ...meter.result() };
  }

  async read(key: string, range?: { start: number; end: number }) {
    assertKey(key);
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const res = await (await this.clientPromise).send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: range ? `bytes=${range.start}-${range.end}` : undefined }),
    );
    return res.Body as Readable;
  }

  async size(key: string) {
    assertKey(key);
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    return (await (await this.clientPromise).send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))).ContentLength ?? 0;
  }

  async remove(key: string) {
    assertKey(key);
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.clientPromise).send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export const storage: StorageDriver = process.env.STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalDiskStorage();
