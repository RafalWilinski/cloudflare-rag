/* eslint-disable @typescript-eslint/no-explicit-any */
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getDocumentProxy, extractText } from "unpdf";
import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";
import { documentChunks, documents } from "schema";
import { ulid } from "ulidx";
import { DrizzleError } from "drizzle-orm";
import { exampleFiles } from "../../app/lib/exampleFiles";

async function uploadToR2(file: File, r2Bucket: R2Bucket, sessionId: string): Promise<string> {
  const r2Key = `${sessionId}/${Date.now()}-${file.name}`;
  await r2Bucket.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  return `${r2Key}`;
}

async function extractTextFromPDF(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const result = await extractText(pdf, { mergePages: true });
  return Array.isArray(result.text) ? result.text.join(" ") : result.text;
}

async function insertDocument(
  db: any,
  file: File,
  textContent: string,
  sessionId: string,
  r2Url: string
) {
  console.log("Inserting document...", { file, textContent, sessionId, r2Url });
  const row = {
    id: ulid(),
    name: file.name,
    size: file.size,
    textContent,
    sessionId,
    r2Url,
  };
  console.log({ row });

  return db.insert(documents).values(row).returning({ insertedId: documents.id });
}

async function insertVectors(
  db: DrizzleD1Database<any>,
  VECTORIZE_INDEX: VectorizeIndex,
  AI: any,
  chunks: string[],
  file: File,
  sessionId: string,
  documentId: string,
  streamResponse: (message: any) => Promise<void>
) {
  console.log("Inserting vectors...", { file, sessionId, documentId });

  const chunkSize = 10;
  const insertPromises = [];
  let progress = 0;

  for (let i = 0; i < chunks.length; i += chunkSize) {
    const chunkBatch = chunks.slice(i, i + chunkSize);

    insertPromises.push(
      (async () => {
        // Generate embeddings for the current batch
        const embeddingResult = await AI.run("@cf/baai/bge-large-en-v1.5", {
          text: chunkBatch,
        });
        const embeddingBatch: number[][] = embeddingResult.data;

        // Insert chunks into the database
        const chunkInsertResults = await db
          .insert(documentChunks)
          .values(
            chunkBatch.map((chunk) => ({
              id: ulid(),
              text: chunk,
              sessionId,
              documentId,
            }))
          )
          .returning({ insertedChunkId: documentChunks.id });

        // Extract the inserted chunk IDs
        const chunkIds = chunkInsertResults.map((result) => result.insertedChunkId);

        // Insert vectors into VECTORIZE_INDEX
        await VECTORIZE_INDEX.insert(
          embeddingBatch.map((embedding, index) => ({
            id: chunkIds[index],
            values: embedding,
            namespace: "default",
            metadata: { sessionId, documentId, chunkId: chunkIds[index], text: chunkBatch[index] },
          }))
        );

        progress += (chunkSize / chunks.length) * 100;
        await streamResponse({
          message: `Embedding... (${progress.toFixed(2)}%)`,
          progress,
        });
      })()
    );
  }

  await Promise.all(insertPromises);
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const { request } = ctx;
  const ipAddress = request.headers.get("cf-connecting-ip") || "";

  const streamResponse = async (message: any) => {
    await writer.write(new TextEncoder().encode(`data: ${JSON.stringify(message)}\n\n`));
  };

  const rateLimit = await ctx.env.rate_limiter.get(ipAddress);
  if (rateLimit) {
    const lastRequestTime = parseInt(rateLimit);
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime - lastRequestTime < 3) {
      return new Response(
        `Too many requests (${currentTime - lastRequestTime}s since last request, ${ipAddress})`,
        { status: 429 }
      );
    }
  }

  await ctx.env.rate_limiter.put(ipAddress, Math.floor(Date.now() / 1000).toString(), {
    expirationTtl: 60,
  });

  if (request.method !== "POST") {
    return new Response("Expected a POST request with a file", { status: 405 });
  }

  ctx.waitUntil(
    (async () => {
      try {
        const formData = await request.formData();
        const file = formData.get("pdf") as File;
        const sessionId = formData.get("sessionId") as string;

        if (exampleFiles.some((example) => example.sessionId === sessionId)) {
          await streamResponse({
            error:
              "You cannot upload files to test session with example files. Please reload the page and try again.",
          });
          await writer.close();
          return;
        }

        const db = drizzle(ctx.env.DB);

        if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
          await streamResponse({
            error: "Please upload a PDF file.",
          });
          await writer.close();
          return;
        }

        // Parallelize independent operations
        const [r2Url, textContent] = await Promise.all([
          uploadToR2(file, ctx.env.R2_BUCKET, sessionId),
          extractTextFromPDF(file),
        ]);

        await streamResponse({ message: "Extracted text from PDF" });

        const insertResult = await insertDocument(db, file, textContent, sessionId, r2Url);

        const splitter = new RecursiveCharacterTextSplitter({
          chunkSize: 500,
          chunkOverlap: 100,
        });

        const chunks = await splitter.splitText(textContent);
        await streamResponse({ message: "Split text into chunks" });

        await insertVectors(
          db,
          ctx.env.VECTORIZE_INDEX,
          ctx.env.AI,
          chunks,
          file,
          sessionId,
          insertResult[0].insertedId,
          streamResponse
        );

        const fileInfo = {
          documentId: insertResult[0].insertedId,
          name: file.name,
          type: file.type,
          size: file.size,
          r2Url,
          chunks,
        };
        console.log({ fileInfo });
        await streamResponse({ message: "Inserted vectors into database", ...fileInfo });

        await writer.close();
      } catch (error) {
        writer.close();
        if (error instanceof DrizzleError) {
          console.error("Drizzle error:", error.cause);
        }
        console.error(
          "Error processing upload:",
          (error as Error).stack,
          Object.keys(error as any)
        );
        console.error(error);
        await streamResponse({
          error: `An error occurred while processing the upload: ${(error as Error).message}`,
        });
        await writer.close();
      }
    })()
  );

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Transfer-Encoding": "chunked",
      "content-encoding": "identity",
    },
  });
};
