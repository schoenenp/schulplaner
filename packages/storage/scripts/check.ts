import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { storageClient, storageConfig, storageObjectKey } from "../src/server";

const { bucket } = storageConfig();
const client = storageClient();
const key = storageObjectKey(`/storage/healthchecks/${randomUUID()}.txt`);
const body = `S3 connection check ${randomUUID()}`;
let written = false;
try {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "text/plain" }));
  written = true;
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (await result.Body?.transformToString() !== body) throw new Error("S3 read-back mismatch");
  console.log("S3 upload and download verified.");
} finally {
  if (written) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    console.log("Connection-check object removed.");
  }
}
