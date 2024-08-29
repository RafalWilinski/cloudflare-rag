/* eslint-disable @typescript-eslint/no-explicit-any */
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getDocumentProxy, extractText } from "unpdf";
import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";
import { documentChunks, documents } from "schema";
import { ulid } from "ulidx";
import { DrizzleError } from "drizzle-orm";

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

async function generateEmbeddings(
  AI: any,
  chunks: string[]
): Promise<{ data: number[][]; chunks: string[] }> {
  console.log("Generating embeddings...", { chunks });

  const chunkSize = 10;
  const embeddingPromises = [];

  for (let i = 0; i < chunks.length; i += chunkSize) {
    const chunkBatch = chunks.slice(i, i + chunkSize);
    embeddingPromises.push(
      AI.run("@cf/baai/bge-large-en-v1.5", {
        text: chunkBatch,
      })
    );
  }

  const results = await Promise.all(embeddingPromises);
  const data = results.flatMap((result) => result.data);

  return { data, chunks };
}

async function insertVectors(
  db: DrizzleD1Database<any>,
  VECTORIZE_INDEX: VectorizeIndex,
  embeddings: { data: number[][]; chunks: string[] },
  file: File,
  sessionId: string,
  documentId: string
) {
  console.log("Inserting vectors...", { file, sessionId, documentId });

  const chunkSize = 10;
  const insertPromises = [];

  for (let i = 0; i < embeddings.chunks.length; i += chunkSize) {
    const chunkBatch = embeddings.chunks.slice(i, i + chunkSize);
    const embeddingBatch = embeddings.data.slice(i, i + chunkSize);

    insertPromises.push(
      (async () => {
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
      })()
    );
  }

  await Promise.all(insertPromises);
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const request = ctx.request;
  const ipAddress = request.headers.get("cf-connecting-ip") || "";

  if (request.method === "POST") {
    try {
      const formData = await ctx.request.formData();
      const file = formData.get("pdf") as File;
      const sessionId = formData.get("sessionId") as string;
      const db = drizzle(ctx.env.DB);

      if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
        return new Response("Please upload a PDF file.", { status: 400 });
      }

      // Parallelize independent operations
      const [r2Url, textContent] = await Promise.all([
        uploadToR2(file, ctx.env.R2_BUCKET, sessionId),
        extractTextFromPDF(file),
      ]);

      const insertResult = await insertDocument(db, file, textContent, sessionId, r2Url);

      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 100,
      });

      const chunks = await splitter.splitText(textContent);

      const embeddings = await generateEmbeddings(ctx.env.AI, chunks);
      await insertVectors(
        db,
        ctx.env.VECTORIZE_INDEX,
        embeddings,
        file,
        sessionId,
        insertResult[0].insertedId
      );

      const fileInfo = {
        documentId: insertResult[0].insertedId,
        name: file.name,
        type: file.type,
        size: file.size,
        r2Url,
        chunks,
      };

      return new Response(JSON.stringify(fileInfo), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      if (error instanceof DrizzleError) {
        console.error("Drizzle error:", error.cause);
      }
      console.error("Error processing upload:", (error as Error).stack, Object.keys(error as any));
      return new Response(
        JSON.stringify({
          error: `An error occurred while processing the upload: ${(error as Error).message}`,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  return new Response("Expected a POST request with a file", { status: 400 });
};
